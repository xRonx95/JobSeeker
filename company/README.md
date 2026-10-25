# Employer portal

Edit the separate HTML source files, then run `node scripts/build-company.cjs` from the repository root. Commit the assembled `company/index.html` too; the deployed site needs no runtime HTML fetching.

- `layout.html`: page shell, metadata, and script/stylesheet references.
- `partials/header.html`, `footer.html`: navigation and footer.
- `partials/dashboard.html`: employer overview.
- `partials/post.html`: vacancy submission form.
- `partials/applications.html`: applicant review section.
- `partials/profile.html`: company profile and password forms.
- Other `partials/*.html`: discovery sections and individual dialogs required by the shared application.
- `company.css`: employer-specific presentation. Shared base styles and `assets/css/compact-theme.css` provide the same typography and controls as the public and admin pages.

The Supabase-backed logic remains in `assets/js/script.js` and its existing modules. Preserve element IDs and data attributes when editing HTML. `scripts/sync-pages.cjs` builds this independent employer portal instead of overwriting it with the public page.
