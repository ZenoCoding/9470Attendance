const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const requiredFiles = [
  'src/appsscript.json',
  'src/Config.gs',
  'src/Attendance.gs',
  'src/Auth.gs',
  'src/WebApp.gs',
  'src/Index.html',
  'src/Client.html',
  'src/Styles.html'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}

const manifest = JSON.parse(fs.readFileSync('src/appsscript.json', 'utf8'));
if (manifest.timeZone !== 'America/Los_Angeles') throw new Error('Unexpected Apps Script timezone.');
if (!manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail')) {
  throw new Error('Email scope is missing.');
}
if (!manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.container.ui')) {
  throw new Error('Container UI scope is missing.');
}

const claspVersion = execFileSync('./node_modules/.bin/clasp', ['--version'], { encoding: 'utf8' }).trim();
console.log(`preflight passed (clasp ${claspVersion})`);
