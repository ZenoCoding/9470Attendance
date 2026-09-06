const fs = require('node:fs');

const styles = fs.readFileSync('src/Styles.html', 'utf8');
const names = [
  'Aarav Patel', 'Alex Chen', 'Amelia Rodriguez', 'Benjamin Lee',
  'Chloe Johnson', 'Daniel Kim', 'Elena Garcia', 'Ethan Williams',
  'Grace Thompson', 'Isaac Nguyen', 'Maya Shah', 'Noah Anderson'
];
const cards = names.map((name, index) => `<button class="student-button"><span>${name}</span>${index < 4 ? '<span class="setup-label">Set PIN</span>' : ''}</button>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><main class="app"><header class="topbar"><h1>Attendance</h1><span class="team-mark">9470</span></header><input class="search" type="search" placeholder="Search students…"><section class="student-grid">${cards}</section></main></body></html>`;
const setupHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><main class="app"><header class="topbar"><h1>Attendance</h1><span class="team-mark">9470</span></header><div class="setup-notice"><strong>PIN setup is open.</strong><span>Students without a PIN can create one and check in. Leader supervision required.</span></div><input class="search" type="search" placeholder="Search students…"><section class="student-grid">${cards}</section></main></body></html>`;
const pinHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><main class="app"><section class="panel"><h2>Alex Chen</h2><div class="pin-dots"><span class="pin-dot filled"></span><span class="pin-dot filled"></span><span class="pin-dot"></span><span class="pin-dot"></span></div><div class="keypad">${[1,2,3,4,5,6,7,8,9].map((number) => `<button class="key">${number}</button>`).join('')}<button class="key">⌫</button><button class="key">0</button><button class="key submit" disabled>✓</button></div><p class="status"></p><div class="actions"><button class="text-button">Back</button><button class="text-button">Forgot PIN?</button></div></section></main></body></html>`;
const createPinHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><main class="app"><section class="panel"><h2>Alex Chen</h2><p class="pin-instruction">Create a four-digit PIN</p><div class="pin-dots"><span class="pin-dot filled"></span><span class="pin-dot filled"></span><span class="pin-dot"></span><span class="pin-dot"></span></div><div class="keypad">${[1,2,3,4,5,6,7,8,9].map((number) => `<button class="key">${number}</button>`).join('')}<button class="key">⌫</button><button class="key">0</button><button class="key submit" disabled>✓</button></div><p class="status"></p><div class="actions"><button class="text-button">Back</button></div></section></main></body></html>`;
fs.mkdirSync('output/playwright', { recursive: true });
fs.writeFileSync('output/playwright/kiosk-preview.html', html);
fs.writeFileSync('output/playwright/setup-preview.html', setupHtml);
fs.writeFileSync('output/playwright/pin-preview.html', pinHtml);
fs.writeFileSync('output/playwright/create-pin-preview.html', createPinHtml);
console.log('output/playwright/kiosk-preview.html\noutput/playwright/setup-preview.html\noutput/playwright/pin-preview.html\noutput/playwright/create-pin-preview.html');
