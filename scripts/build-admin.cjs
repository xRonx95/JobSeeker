// Assemble static HTML before deployment; no runtime fetching or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function buildAdmin() {
  const directory = path.join(root, 'admin');
  const layout = fs.readFileSync(path.join(directory, 'layout.html'), 'utf8');
  const html = layout.replace(/<!-- admin-partial: ([a-z-]+) -->/g, (_, name) =>
    fs.readFileSync(path.join(directory, 'partials', `${name}.html`), 'utf8').trimEnd());
  fs.writeFileSync(path.join(directory, 'index.html'), html);
  console.log('Assembled admin/index.html from admin/layout.html and admin/partials/.');
}
if (require.main === module) buildAdmin();
module.exports = buildAdmin;
