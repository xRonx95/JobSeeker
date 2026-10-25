// Admin and company portals have independent HTML source sections.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const assetVersion = 'formal-compact-1';
const refreshAssets = content => content.replace(/((?:src|href)=")(\/(?:assets\/[^"?]+|config\.js|favicon\.ico))(?:\?[^\"]*)?(\")/g, `$1$2?v=${assetVersion}$3`);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<dialog id="authDialog"[\s\S]*?<\/dialog>/,fs.readFileSync(path.join(root,'assets/templates/auth-dialog.html'),'utf8'));
const mobileShell = fs.readFileSync(path.join(root,'assets/templates/mobile-shell.html'),'utf8');
html = html.replace(/<!-- MOBILE APP SHELL -->[\s\S]*?<!-- END MOBILE APP SHELL -->\s*/,'');
html = html.replace('</body>',`<!-- MOBILE APP SHELL -->\n${mobileShell}\n<!-- END MOBILE APP SHELL -->\n</body>`);
html = refreshAssets(html);
fs.writeFileSync(path.join(root, 'index.html'), html);
for (const file of ['reset-password.html','privacy.html','terms.html']) {
  const location = path.join(root,file);
  fs.writeFileSync(location,refreshAssets(fs.readFileSync(location,'utf8')));
}
require('./build-admin.cjs')();
require('./build-company.cjs')();
require('./build-seeker.cjs')();
console.log('Updated shared public components and assembled all three independent portals.');
