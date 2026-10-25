const fs = require('node:fs');
const path = require('node:path');
function buildSeeker() {
  const directory = path.resolve(__dirname, '../job-seeker');
  function assemble(html, stack = []) {
    return html.replace(/<!-- seeker-partial: ([a-z-]+) -->/g, (_, name) => {
      if (stack.includes(name)) throw new Error('Circular seeker partial: ' + name);
      return assemble(fs.readFileSync(path.join(directory, 'partials', name + '.html'), 'utf8').trimEnd(), [...stack, name]);
    });
  }
  fs.writeFileSync(path.join(directory, 'index.html'), assemble(fs.readFileSync(path.join(directory, 'layout.html'), 'utf8')));
  console.log('Assembled job-seeker/index.html from its layout and HTML partials.');
}
if (require.main === module) buildSeeker();
module.exports = buildSeeker;
