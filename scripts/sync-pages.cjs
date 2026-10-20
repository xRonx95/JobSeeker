// The public page is the shared template for all role portals.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<section id="home"');
const end = html.indexOf('<section id="dashboard"');
if (start < 0 || end < 0) throw new Error('Cannot locate shared page sections.');
html = html.slice(0, start) + fs.readFileSync(path.join(root, 'assets/templates/vacancies.html'), 'utf8') + '\n' + html.slice(end);
html = html.replace(/<dialog id="authDialog"[\s\S]*?<\/dialog>/,fs.readFileSync(path.join(root,'assets/templates/auth-dialog.html'),'utf8'));
fs.writeFileSync(path.join(root, 'index.html'), html);
for (const [folder, role, title] of [
  ['admin', 'admin', 'Administration'],
  ['company', 'company', 'Employer dashboard'],
  ['job-seeker', 'seeker', 'Job seeker dashboard'],
]) {
  fs.writeFileSync(path.join(root, folder, 'index.html'), html
    .replace('data-portal="public"', `data-portal="${role}"`)
    .replace('<title>Isabela Careers | Local Job Portal</title>', `<title>${title} | Isabela Careers</title>`));
}
console.log('Updated all three role portals from index.html.');
