# Job seeker portal

Edit `layout.html` and the HTML sections in `partials/`, then run `node scripts/build-seeker.cjs` from the repository root. Commit the generated `index.html` for static deployment.

The Personal information page is split into `profile.html`, `personal-information.html`, `education.html`, `family.html`, `background.html`, and `account-security.html`. Other portal sections and dialogs have their own HTML files. `job-seeker.css` contains presentation, and `profile.js` contains accessible tab interactions and profile persistence. All section values are saved together; switching tabs preserves draft input. Arrow keys, Home, and End navigate tabs.

Before deploying this version, run `migrations/005-seeker-information.sql` in the existing Supabase SQL Editor after migration 004. It creates an owner-only table for optional personal, education, family, and professional background fields, plus an atomic save RPC. It does not expose these fields to companies or administrators, change application records, or change roles. Existing name, phone, location and biography remain in `profiles` with their existing access rules. A failed load disables Save to prevent overwriting previously saved information.

The migration is safe to rerun. Do not rerun the original `schema.sql` on an existing database. It must be applied separately; the HTML assembly script does not modify the database.

`scripts/sync-pages.cjs` assembles all three independent role portals and preserves this job seeker source.
