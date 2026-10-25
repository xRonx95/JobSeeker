// Admin and company portals have independent HTML source sections.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const assetVersion = 'formal-compact-1';
const refreshAssets = content => content.replace(/((?:src|href)=")(\/(?:assets\/[^"?]+|config\.js|favicon\.ico))(?:\?[^\"]*)?(\")/g, `$1$2?v=${assetVersion}$3`);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<section id="home"');
const end = html.indexOf('<section id="dashboard"');
if (start < 0 || end < 0) throw new Error('Cannot locate shared page sections.');
html = html.slice(0, start) + fs.readFileSync(path.join(root, 'assets/templates/vacancies.html'), 'utf8') + '\n' + html.slice(end);
html = html.replace(/<dialog id="authDialog"[\s\S]*?<\/dialog>/,fs.readFileSync(path.join(root,'assets/templates/auth-dialog.html'),'utf8'));
const mobileShell = fs.readFileSync(path.join(root,'assets/templates/mobile-shell.html'),'utf8');
html = html.replace(/<!-- MOBILE APP SHELL -->[\s\S]*?<!-- END MOBILE APP SHELL -->\s*/,'');
html = html.replace('</body>',`<!-- MOBILE APP SHELL -->\n${mobileShell}\n<!-- END MOBILE APP SHELL -->\n</body>`);
html = refreshAssets(html);
fs.writeFileSync(path.join(root, 'index.html'), html);
for (const [folder, role, title] of [
  ['job-seeker', 'seeker', 'Job seeker dashboard'],
]) {
  fs.writeFileSync(path.join(root, folder, 'index.html'), html
    .replace('data-portal="public"', `data-portal="${role}"`)
    .replace('<title>HapIsabela | Local Job Portal</title>', `<title>${title} | HapIsabela</title>`));
}
for (const file of ['reset-password.html','privacy.html','terms.html']) {
  const location = path.join(root,file);
  fs.writeFileSync(location,refreshAssets(fs.readFileSync(location,'utf8')));
}
require('./build-admin.cjs')();
require('./build-company.cjs')();
console.log('Updated the seeker portal; assembled the independent admin and company portals.');
