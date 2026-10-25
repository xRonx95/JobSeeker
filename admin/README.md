# Administration portal

Edit the source files, then run `node scripts/build-admin.cjs` from the repository root.
Commit the generated `admin/index.html` with the source so static hosting works without a build service.

- `layout.html`: page shell, metadata, stylesheet and script references.
- `partials/header.html` and `partials/footer.html`: navigation and footer.
- `partials/overview.html`: administration heading and dashboard container.
- `partials/applications.html`: applications section.
- `partials/profile.html`: profile and password forms.
- `partials/home.html`, `fairs.html`, `training.html`, `advice.html`, `employers.html`, `dashboard.html`, and `post.html`: the other portal sections used by the shared application.
- `partials/*-dialog.html`: individual account, user creation, vacancy, application and resource dialogs.
- `admin.css`: all administration-specific presentation; shared base controls are in `assets/css/`.

Dynamic tables, statistics, moderation and pagination remain in `assets/js/admin-dashboard.js`; account creation remains in `assets/js/admin-users.js`. Keep business logic in JavaScript and presentation in CSS. Retain element IDs and data attributes because the existing application uses them to bind events.

`scripts/sync-pages.cjs` assembles this independent admin portal rather than overwriting it with the public homepage.
