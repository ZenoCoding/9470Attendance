const fs = require('node:fs');
const path = require('node:path');

JSON.parse(fs.readFileSync('src/appsscript.json', 'utf8'));

for (const filename of fs.readdirSync('src').filter((name) => name.endsWith('.gs'))) {
  const source = fs.readFileSync(path.join('src', filename), 'utf8');
  new Function(source);
}

const client = fs.readFileSync('src/Client.html', 'utf8')
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
new Function(client);
console.log('syntax tests passed');
