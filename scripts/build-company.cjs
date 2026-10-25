// Assemble the employer portal for static hosting; no runtime includes required.
const fs = require('node:fs');
const path = require('node:path');
function buildCompany() {
  const directory = path.resolve(__dirname, '../company');
  const layout = fs.readFileSync(path.join(directory, 'layout.html'), 'utf8');
  const html = layout.replace(/<!-- company-partial: ([a-z-]+) -->/g, (_, name) =>
    fs.readFileSync(path.join(directory, 'partials', `${name}.html`), 'utf8').trimEnd());
  fs.writeFileSync(path.join(directory, 'index.html'), html);
  console.log('Assembled company/index.html from company/layout.html and company/partials/.');
}
if (require.main === module) buildCompany();
module.exports = buildCompany;
