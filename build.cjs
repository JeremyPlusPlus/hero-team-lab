const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const readSource = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
let html = readSource('index.template.html');
html = html.replace(/<link\s+rel="stylesheet"\s+href="styles.css"\s*\/?\s*>/, () =>
  `<style>\n${readSource('styles.css')}\n</style>`);
for (const file of ['data.js', 'engine.js', 'immortal-data.js', 'immortal.js', 'immortal-search.js', 'app.js']) {
  let source = readSource(file);
  if (file === 'app.js') {
    const reviewPath = path.join(root, 'source', 'milestone-review', 'review.json');
    if (fs.existsSync(reviewPath)) source = 'window.MILESTONE_REVIEW = ' + JSON.stringify(JSON.parse(fs.readFileSync(reviewPath, 'utf8'))) + ';\n' + source;
  }
  source = source.replace(/<\/script/gi, '<\\/script');
  html = html.replace(new RegExp(`<script src="${file.replace('.', '\\.')}"\\s*><\\/script>`), () => `<script data-source="${file}">\n${source}\n</script>`);
}
if (/<script\s+src=|<link\s+rel="stylesheet"/.test(html)) throw new Error('Unbundled local dependency remains.');
fs.writeFileSync(path.join(root, 'hero-team-lab.html'), html);
console.log(`Built standalone hero-team-lab.html (${Buffer.byteLength(html).toLocaleString()} bytes).`);
