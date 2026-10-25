# Isabela Careers — role-separated website

HTML/CSS/JS frontend with a protected Vercel account-creation API, Supabase Authentication, PostgreSQL, Row Level Security, and private Supabase Storage.

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

### Job seeker personal information

Run [migrations/005-seeker-information.sql](migrations/005-seeker-information.sql) in the existing Supabase SQL Editor after migration 004, then deploy the updated files. The Personal information page has Personal information, Education, Family, and Background tabs with one atomic save. Additional records are owner-only; employer access to existing basic profile/application fields remains governed by the existing policies. Source files and rebuild instructions are in [job-seeker/README.md](job-seeker/README.md). The migration has not been applied automatically.

### Upgrade the existing portal

1. Open the existing project's Supabase SQL Editor and run [migrations/002-career-portal.sql](migrations/002-career-portal.sql). It adds opportunity groups, saved jobs, career content, a public employer directory RPC, and the document attachment fix. It is safe to rerun. Do not rerun `schema.sql` on an existing database.
2. Run `node scripts/check-connection.cjs --features` to check the new public endpoints.
3. Redeploy the updated root folder to the existing Vercel project.
4. Sign in as an administrator and choose **Manage fairs, training & advice** to create, edit, publish, or delete content. Event times use Philippine time. No invented employers or events are inserted.

### Administrator account creation and public signup

If Add user fails, the dialog now distinguishes expired sessions, unavailable API routes, hosting timeouts, rejected server credentials, and database errors. A timeout can leave an account created even when its response was lost; check All users and Supabase Authentication for the email before retrying. Do not reset or recreate an existing account to diagnose this error. For an HTTP 500/502/504 response, inspect the `/api/admin/users` function in Vercel logs using the deployment reference shown in the dialog. Never share session tokens, passwords, or server keys in a bug report.

The account endpoint has an explicit 60-second hosting limit in `vercel.json`, following [Vercel's function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration), with each upstream request limited to 10 seconds so error handling and rollback can finish. Deploy both the API/configuration and browser changes together; local edits do not repair an existing live deployment.

1. In Vercel Project Settings > Environment Variables, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` for each deployment environment you use. See [.env.example](.env.example) for names. Use a current server secret key; do not put it in `config.js` or browser assets.
2. Deploy this whole project, including `api/admin/users.mjs`, to Vercel. The API uses Node.js and has no package dependencies; serving only the HTML files does not run it.
3. In the existing Supabase project's SQL Editor, run [migrations/004-public-seeker-company-signup.sql](migrations/004-public-seeker-company-signup.sql). It supersedes migration 003, restores public signup for seekers and companies, and allows only trusted administrator metadata to assign admin roles. Existing accounts and passwords are unchanged. Do not rerun the original schema or apply migration 003 after migration 004.
4. In Supabase Authentication settings, enable **Allow new users to sign up**. Public company signups are pending until approved; job seekers are active after any required email confirmation. Admin accounts can only be created through the protected admin endpoint or project-owner administration.
5. Log in as an active administrator. Select **Admin → Add user**, enter name and email, choose Job seeker, Company / Employer, or Administrator, and optionally enter an initial password. Company accounts require a company name. A blank password generates a strong one.

New admin-created accounts are active and email-confirmed, without sending signup emails or logging the new user in. The administrator stays signed in. Credentials are shown once in the dialog, masked by default; share them privately. Users can update their initial password under Profile settings. The browser uses its existing session token to call the server; the server independently verifies the caller and checks the current database role. Existing emails return an error without changing their password or role. Failed profile setup triggers deletion of the newly created login; uncertain cleanup is explicitly reported.

For a brand-new project, create the initial administrator with `scripts/provision-admin.cjs` using hidden stdin for the server key, or create an Auth user in the Supabase dashboard and promote it with the SQL below. Public signup has no administrator option, and supplying an admin role directly is rejected by migration 004.

Validate account creation without production writes using `node --test tests/admin-users.test.mjs tests/vacancies.test.cjs` and `node tests/browser-review.cjs`.

### New database

1. Create a Supabase project at https://supabase.com/dashboard.
2. Run `schema.sql` in the Supabase SQL Editor (once, on a new project), followed by `migrations/002-career-portal.sql` and `migrations/004-public-seeker-company-signup.sql`. Migration 003 is an older admin-only policy and is not needed for new deployments.
3. Copy your Supabase Project URL and **publishable / anon** key into `config.js`.
4. In Supabase Authentication > URL Configuration, set Site URL to your production Vercel URL and add relevant redirect URLs (`https://YOUR-SITE.vercel.app/**` for redirects).
5. Publish this folder's **contents as the Vercel project root**. Framework preset: Other; no build command; output directory: default/root. All folders must be committed.
6. Create the first administrator using the bootstrap steps above. Never allow untrusted users to self-elevate roles.

## Check a failed database connection

HTTPS deployments send Supabase SDK authentication, database, and storage HTTP requests through `/supabase/` on the website's own domain. `vercel.json` uses [external rewrites](https://vercel.com/docs/routing/rewrites) to the configured Supabase project. This avoids requiring the visitor's browser to connect directly to the Supabase hostname. The original project URL and session storage key are preserved; Supabase still checks the user's token and RLS. These routes are marked private/no-store and use no server secret. Local HTTP static previews continue to use the direct project URL.

Deploy `vercel.json`, `config.js`, `assets/js/connection.js`, the updated application scripts, and all HTML changes together. If the Supabase project changes, update both `config.js` and the three fixed destinations in `vercel.json`. Verify `/supabase/auth/v1/settings` and a public jobs request with the publishable key after deployment; a static server without Vercel rewrites cannot serve these HTTPS routes. Protected portals display a connection/retry screen until session verification succeeds, rather than showing the public jobs page after a startup error.

Run `node scripts/check-connection.cjs` (Node.js 18 or newer). This checks the Auth endpoint and reads at most one approved job using the public key; it does not modify data.

- `ENOTFOUND`: copy the exact Project URL from Supabase's Connect dialog into `config.js`. A key cannot repair an incorrect hostname.
- HTTP 401: verify that the publishable key belongs to that same project.
- Missing `jobs` table: run `schema.sql` once on the new project in Supabase SQL Editor. API keys cannot create the database schema.
- Permission denied: review the grants and Row Level Security policies in `schema.sql`.

After changing `config.js`, redeploy the updated files to the existing Vercel project. The local changes do not update an existing deployment automatically.

Keep `sb_secret_` keys out of this static site. If a secret key was shared, revoke it in Supabase Settings > API Keys and create a replacement for any server that needs it.

## Role pages

- `/` — public job listings, login, and seeker/company signup
- `/admin/` — administrator dashboard
- `/company/` — employer dashboard
- `/job-seeker/` — job seeker dashboard

After login the frontend redirects based on the account role. The role routes are convenience/navigation only: **Supabase RLS and RPC permissions** are the actual security boundaries. Unauthenticated visitors are routed back to the home page.

## Initial admin promotion

For an existing Auth user, use a privileged Supabase SQL Editor session (not browser JavaScript) with the appropriate verified user UUID:

```sql
update public.profiles
set role = 'admin', approval_status = 'active'
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

## Notes

- **Action notifications:** `assets/js/notifications.js` and `assets/css/notifications.css` provide the shared, dismissible popup on every portal and password recovery page. Successful actions close open form dialogs; failed submissions keep their form open. Add user closes the creation form and shows email and a masked initial password in the success popup. Closing that popup removes its credentials from the DOM; they are never put in local/session storage. Plain login/logout messages can pass through a role redirect. Deploy the shared notification assets with all updated HTML pages.

- **Mobile web app:** At widths up to 800px, HapIsabela uses a compact header, personalized greeting, pill search and category filters, rounded vacancy cards, bottom-sheet details, and a floating green navigation dock. Discover and Saved use the existing vacancy filters; Activity opens the appropriate seeker/company/admin workspace; Account opens Profile settings. Signed-out visitors are prompted to log in for private destinations. The mobile menu includes login/signup or logout.
- **Home-screen installation:** Deploy `manifest.webmanifest`, `sw.js`, `offline.html`, and `assets/icons/` alongside the website over HTTPS. Supported browsers can install the site; an Install HapIsabela action appears in the mobile menu when the browser offers installation. Other supported browsers can use their own Add to Home Screen action. This is an installable web app, with the same accounts and database as the website.
- **Offline behavior:** The service worker keeps only the generic offline screen and its app icon. It never caches account pages, API responses, application documents, or database requests. Browsing vacancies and using account features require a network connection. `sw.js` is configured to revalidate on deployment.

- Administrator statistics use database `count: 'exact'` queries. Companies, users, jobs, and applications load in ordered pages of 25 records, including the standalone administrator Applications view. The dashboard no longer fetches just the first 500 records or reports partial totals.
- The green theme uses system fonts and larger inputs, navigation, and vacancy titles. Mobile spacing is defined in `assets/css/mobile-app.css`. Login/signup share `assets/templates/auth-dialog.html`, and the mobile navigation shell uses `assets/templates/mobile-shell.html`; update these and run `node scripts/sync-pages.cjs` to refresh all four role pages.
- `favicon.ico` is a multi-resolution conversion of `image/hapisabela.jpg`. Regenerate it using `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-favicon.ps1`. Every portal, password reset page, and policy page references the root icon.

- **Password reset:** Profile settings lets signed-in users update their password or request a reset email. The login dialog also links to `/reset-password.html`. Add `https://jobseeker-neon.vercel.app/reset-password.html` (and any custom-domain equivalent) to Supabase Authentication > URL Configuration > Redirect URLs. Recovery email delivery requires available Supabase email quota or configured SMTP. Direct signed-in password updates do not send email. Supabase controls password strength, session requirements, and any reauthentication policy. See the [Supabase password reset documentation](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

- The vacancy directory includes keyword/location/category/type filters, explicit opportunity groups, sorting, ten results per page, saved jobs, and top openings derived from approved listings. Selected opportunity groups match any selected group; all other filters combine.
- Employers set opportunity groups on their vacancy form; untagged listings do not claim eligibility. Existing listings remain untagged until updated by a database administrator or replaced through the employer posting flow.
- Saved jobs persist per signed-in user in Supabase. Private application documents remain separate from public career content.
- Job fairs and training show future published events. Three built-in career guides remain available before the migration. The approved-employer directory exposes business names, location, bio, and opening counts; it excludes contact details and does not claim government accreditation.
- Edit the vacancy/resource sections in `assets/templates/vacancies.html`, authentication in `assets/templates/auth-dialog.html`, and the remaining shared layout in `index.html`. Run `node scripts/sync-pages.cjs` to update all four pages from these templates.
- Verify with `node --test tests/vacancies.test.cjs` and `node tests/browser-review.cjs`. Browser checks use Chrome on Windows and intercepted Supabase fixtures, without writing production data. Screenshots are saved under ignored `.tmp-ui/`.

- Administrators can create active accounts for all three roles. Public signup supports seekers and companies only; company signup needs administrator approval before posting.
- Job postings need approval before appearing publicly.
- Requirements are stored in a private bucket; application viewers obtain short-lived signed URLs subject to RLS.
- No real jobs exist until approved companies submit them.
- On Vercel, direct paths `/admin/`, `/company/`, `/job-seeker/` work via folder `index.html` files.
- Don't put your Supabase service_role or database password in frontend code.
- Test login, registration, employer approvals, job approvals, private document access and role access with separate accounts before production.
