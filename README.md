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

1. Create a Supabase project at https://supabase.com/dashboard.
2. Run `schema.sql` in the Supabase SQL Editor (once, on a new project).
3. Copy your Supabase Project URL and **publishable / anon** key into `config.js`.
4. In Supabase Authentication > URL Configuration, set Site URL to your production Vercel URL and add relevant redirect URLs (`https://YOUR-SITE.vercel.app/**` for redirects).
5. Publish this folder's **contents as the Vercel project root**. Framework preset: Other; no build command; output directory: default/root. All folders must be committed.
6. Register the first user, then assign its Admin role using the SQL documented below. Never allow untrusted users to self-elevate roles.

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

- Company signups are pending until approved by an admin.
- Job postings need approval before appearing publicly.
- Requirements are stored in a private bucket; application viewers obtain short-lived signed URLs subject to RLS.
- No real jobs exist until approved companies submit them.
- On Vercel, direct paths `/admin/`, `/company/`, `/job-seeker/` work via folder `index.html` files.
- Don't put your Supabase service_role or database password in frontend code.
- Test login, registration, employer approvals, job approvals, private document access and role access with separate accounts before production.
