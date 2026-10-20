# Isabela Careers — role-separated website

Static HTML/CSS/JS frontend using Supabase Authentication, PostgreSQL, Row Level Security and private Supabase Storage; deploys to Vercel.

## Folder structure

```text
isabela-careers-role-folders/
├── index.html                # Public homepage, authentication, job search
├── admin/
│   └── index.html            # Admin moderation, users, applications
├── company/
│   └── index.html            # Company jobs, applicant tracking, profile
├── job-seeker/
│   └── index.html            # Job discovery, requirements upload, tracking
├── assets/
│   ├── css/style.css         # Shared styling
│   └── js/script.js          # Shared role-aware frontend and Supabase calls
├── config.js                 # Supabase public project URL and publishable key
├── schema.sql                # Schema, policies and storage controls
└── vercel.json               # Vercel security headers
```

## Setup

### Upgrade the existing portal

1. Open the existing project's Supabase SQL Editor and run [migrations/002-career-portal.sql](migrations/002-career-portal.sql). It adds opportunity groups, saved jobs, career content, a public employer directory RPC, and the document attachment fix. It is safe to rerun. Do not rerun `schema.sql` on an existing database.
2. Run `node scripts/check-connection.cjs --features` to check the new public endpoints.
3. Redeploy the updated root folder to the existing Vercel project.
4. Sign in as an administrator and choose **Manage fairs, training & advice** to create, edit, publish, or delete content. Event times use Philippine time. No invented employers or events are inserted.

### New database

1. Create a Supabase project at https://supabase.com/dashboard.
2. Run `schema.sql` in the Supabase SQL Editor (once, on a new project), followed by `migrations/002-career-portal.sql`.
3. Copy your Supabase Project URL and **publishable / anon** key into `config.js`.
4. In Supabase Authentication > URL Configuration, set Site URL to your production Vercel URL and add relevant redirect URLs (`https://YOUR-SITE.vercel.app/**` for redirects).
5. Publish this folder's **contents as the Vercel project root**. Framework preset: Other; no build command; output directory: default/root. All folders must be committed.
6. Register the first user, then assign its Admin role using the SQL documented below. Never allow untrusted users to self-elevate roles.

## Check a failed database connection

Run `node scripts/check-connection.cjs` (Node.js 18 or newer). This checks the Auth endpoint and reads at most one approved job using the public key; it does not modify data.

- `ENOTFOUND`: copy the exact Project URL from Supabase's Connect dialog into `config.js`. A key cannot repair an incorrect hostname.
- HTTP 401: verify that the publishable key belongs to that same project.
- Missing `jobs` table: run `schema.sql` once on the new project in Supabase SQL Editor. API keys cannot create the database schema.
- Permission denied: review the grants and Row Level Security policies in `schema.sql`.

After changing `config.js`, redeploy the updated files to the existing Vercel project. The local changes do not update an existing deployment automatically.

Keep `sb_secret_` keys out of this static site. If a secret key was shared, revoke it in Supabase Settings > API Keys and create a replacement for any server that needs it.

## Role pages

- `/` — public job listings and login/signup
- `/admin/` — administrator dashboard
- `/company/` — employer dashboard
- `/job-seeker/` — job seeker dashboard

After login the frontend redirects based on the account role. The role routes are convenience/navigation only: **Supabase RLS and RPC permissions** are the actual security boundaries. Unauthenticated visitors are routed back to the home page.

## Initial admin promotion

After signup, use a privileged Supabase SQL Editor session (not browser JavaScript) with the appropriate verified user UUID:

```sql
update public.profiles
set role = 'admin', approval_status = 'active'
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

## Notes

- **Password reset:** Profile settings lets signed-in users update their password or request a reset email. The login dialog also links to `/reset-password.html`. Add `https://jobseeker-neon.vercel.app/reset-password.html` (and any custom-domain equivalent) to Supabase Authentication > URL Configuration > Redirect URLs. Recovery email delivery requires available Supabase email quota or configured SMTP. Direct signed-in password updates do not send email. Supabase controls password strength, session requirements, and any reauthentication policy. See the [Supabase password reset documentation](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

- The vacancy directory includes keyword/location/category/type filters, explicit opportunity groups, sorting, ten results per page, saved jobs, and top openings derived from approved listings. Selected opportunity groups match any selected group; all other filters combine.
- Employers set opportunity groups on their vacancy form; untagged listings do not claim eligibility. Existing listings remain untagged until updated by a database administrator or replaced through the employer posting flow.
- Saved jobs persist per signed-in user in Supabase. Private application documents remain separate from public career content.
- Job fairs and training show future published events. Three built-in career guides remain available before the migration. The approved-employer directory exposes business names, location, bio, and opening counts; it excludes contact details and does not claim government accreditation.
- Edit the vacancy and resource sections in `assets/templates/vacancies.html` and the remaining shared layout in `index.html`. Run `node scripts/sync-pages.cjs` to update all four pages from these templates.
- Verify with `node --test tests/vacancies.test.cjs` and `node tests/browser-review.cjs`. Browser checks use Chrome on Windows and intercepted Supabase fixtures, without writing production data. Screenshots are saved under ignored `.tmp-ui/`.

- Company signups are pending until approved by an admin.
- Job postings need approval before appearing publicly.
- Requirements are stored in a private bucket; application viewers obtain short-lived signed URLs subject to RLS.
- No real jobs exist until approved companies submit them.
- On Vercel, direct paths `/admin/`, `/company/`, `/job-seeker/` work via folder `index.html` files.
- Don't put your Supabase service_role or database password in frontend code.
- Test login, registration, employer approvals, job approvals, private document access and role access with separate accounts before production.
