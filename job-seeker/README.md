# Job seeker portal

Edit `layout.html` and the HTML sections in `partials/`, then run `node scripts/build-seeker.cjs` from the repository root. Commit the generated `index.html` for static deployment.

The Personal information page is split into `profile.html`, `personal-information.html`, `education.html`, `family.html`, `background.html`, and `account-security.html`. Other portal sections and dialogs have their own HTML files. `job-seeker.css` contains presentation, and `profile.js` contains accessible tab interactions and profile persistence. All section values are saved together; switching tabs preserves draft input. Arrow keys, Home, and End navigate tabs.

Before deploying this version, run `migrations/005-seeker-information.sql` after migration 004, followed by `migrations/006-applicant-information-access.sql`, in the existing Supabase SQL Editor. Migration 005 creates the owner-only table and atomic save RPC. Migration 006 adds a separate read RPC scoped to an application: an active administrator or the active company owning the application’s job can view the applicant’s current personal, education, family, and background information. Other companies and unauthenticated visitors cannot use this RPC to read it. Direct table queries remain owner-only. Existing name, phone, location and biography remain in `profiles` with their existing access rules. A failed load disables Save to prevent overwriting previously saved information.

The migration is safe to rerun. Do not rerun the original `schema.sql` on an existing database. It must be applied separately; the HTML assembly script does not modify the database.

`scripts/sync-pages.cjs` assembles all three independent role portals and preserves this job seeker source.
