function getWebAppUrl_() {
  const url = APP.webAppUrl || ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy the script as a web app before creating links.');
  return url;
}

function createLink_(type, studentId, kioskId, lifetimeMs) {
  const token = randomToken_();
  getSheet_(APP.sheets.links).appendRow([
    type,
    sha256_(token),
    studentId || '',
    kioskId || '',
    new Date(Date.now() + lifetimeMs),
    '',
    now_()
  ]);
  return token;
}

function findLink_(type, token) {
  const sheet = getSheet_(APP.sheets.links);
  if (!token || sheet.getLastRow() < 2) return null;
  const hash = sha256_(token);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row[0] !== type || !sameString_(row[1], hash)) continue;
    if (row[5] || !(row[4] instanceof Date) || row[4].getTime() < Date.now()) return null;
    return { sheetRow: index + 2, studentId: String(row[2] || ''), kioskId: String(row[3] || '') };
  }
  return null;
}

function consumeLink_(link) {
  getSheet_(APP.sheets.links).getRange(link.sheetRow, 6).setValue(now_());
}

function invalidatePinLinksForStudent_(studentId) {
  const sheet = getSheet_(APP.sheets.links);
  if (sheet.getLastRow() < 2) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const timestamp = now_();
  let invalidated = 0;
  rows.forEach((row, index) => {
    if (row[0] !== 'PIN' || String(row[2] || '') !== String(studentId) || row[5]) return;
    sheet.getRange(index + 2, 6).setValue(timestamp);
    invalidated += 1;
  });
  return invalidated;
}

function sendPinSetupEmails() {
  syncRoster_();
  const roster = getSheet_(APP.sheets.roster);
  const rows = roster.getLastRow() < 2 ? [] : roster.getRange(2, 1, roster.getLastRow() - 1, 8).getValues();
  const candidates = rows.filter((row) => row[0] && row[1] && row[4] === 'Active' && row[5] !== 'Set');
  const missingEmail = rows.filter((row) => row[0] && !row[1] && row[4] === 'Active' && row[5] !== 'Set');
  if (!candidates.length) {
    SpreadsheetApp.getUi().alert(missingEmail.length
      ? `No setup emails sent. ${missingEmail.length} active student${missingEmail.length === 1 ? '' : 's'} without a PIN also ${missingEmail.length === 1 ? 'has' : 'have'} no email; use supervised PIN setup at the kiosk.`
      : 'Every active student with an email already has a PIN.');
    return;
  }
  const ui = SpreadsheetApp.getUi();
  const missingNames = missingEmail.map((row) => String(row[0])).join(', ');
  const detail = [
    `Send a fresh, seven-day PIN setup link to ${candidates.length} active student${candidates.length === 1 ? '' : 's'} who ${candidates.length === 1 ? 'has' : 'have'} not set a PIN?`,
    missingEmail.length ? `No email and no PIN: ${missingNames}` : ''
  ].filter(Boolean).join('\n\n');
  if (ui.alert('Send PIN setup emails?', detail, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const remaining = MailApp.getRemainingDailyQuota();
  if (remaining < candidates.length) {
    throw new Error(`Email quota is ${remaining}; ${candidates.length} setup emails are needed.`);
  }
  candidates.forEach((row) => {
    const [name, email] = row;
    const studentId = String(row[7]);
    sendPinEmail_(studentId, name, email, 'Set your attendance PIN');
    const rosterRow = rows.indexOf(row) + 2;
    roster.getRange(rosterRow, 7).setValue(now_()).setNumberFormat('mmm d, yyyy h:mm am/pm');
  });
  audit_('SEND_SETUP_EMAILS', '', `${candidates.length} recipients`);
  const remainder = missingEmail.length
    ? ` ${missingEmail.length} student${missingEmail.length === 1 ? '' : 's'} without email can use supervised PIN setup.`
    : '';
  SpreadsheetApp.getUi().alert(`Sent ${candidates.length} PIN setup email${candidates.length === 1 ? '' : 's'}.${remainder}`);
}

function sendPinEmail_(studentId, name, email, subject) {
  invalidatePinLinksForStudent_(studentId);
  const token = createLink_('PIN', studentId, '', APP.pinLinkHours * 60 * 60 * 1000);
  const url = `${getWebAppUrl_()}?mode=pin&token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml_(name);
  const safeUrl = escapeHtml_(url);
  MailApp.sendEmail({
    to: email,
    subject,
    htmlBody: `<p>Hi ${safeName},</p><p><a href="${safeUrl}">Choose your four-digit attendance PIN</a></p><p>This link expires in seven days and works once.</p><p>Team 9470</p>`,
    body: `Hi ${name},\n\nChoose your four-digit attendance PIN:\n${url}\n\nThis link expires in seven days and works once.\n\nTeam 9470`
  });
}

function validatePinLink(token) {
  const link = findLink_('PIN', token);
  if (!link) return { ok: false, message: 'This link is invalid or expired.' };
  const student = getStudentById_(link.studentId);
  if (!student || !student.active) return { ok: false, message: 'This student is no longer active.' };
  return { ok: true, name: student.name };
}

function setPinWithToken(token, pin, confirmation) {
  pin = String(pin || '');
  if (pin !== String(confirmation || '')) return { ok: false, message: 'PINs do not match.' };
  if (!isAllowedPin_(pin)) return { ok: false, message: 'Choose a less predictable four-digit PIN.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const link = findLink_('PIN', token);
    if (!link) return { ok: false, message: 'This link is invalid or expired.' };
    const students = getSheet_(APP.sheets.students);
    const row = findStudentRow_(link.studentId);
    if (!row) return { ok: false, message: 'This student was not found.' };
    const salt = randomToken_();
    students.getRange(row, 4, 1, 4).setValues([[salt, hashPin_(pin, salt), students.getRange(row, 6).getValue() || now_(), now_()]]);
    invalidatePinLinksForStudent_(link.studentId);
    updateRosterPinStatus_(link.studentId, 'Set');
    audit_('SET_PIN', link.studentId, 'PIN created or reset');
    return { ok: true, message: 'PIN saved.' };
  } finally {
    lock.releaseLock();
  }
}

function requestPinReset(studentId, kioskCredential) {
  requireKiosk_(kioskCredential);
  const cache = CacheService.getScriptCache();
  const key = `reset:${studentId}`;
  if (cache.get(key)) return { ok: true, message: 'Reset email already sent.' };
  const student = getStudentById_(studentId);
  if (!student || !student.active) return { ok: false, message: 'Student not available.' };
  if (!student.email) return { ok: false, code: 'NO_EMAIL', message: 'Ask a leader to reset your PIN.' };
  sendPinEmail_(student.id, student.name, student.email, 'Reset your attendance PIN');
  cache.put(key, '1', 300);
  audit_('REQUEST_PIN_RESET', student.id, 'Kiosk request');
  return { ok: true, message: `Reset link sent to ${maskEmail_(student.email)}.` };
}

function createKioskActivationLink() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Create kiosk', 'Device label', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const label = response.getResponseText().trim();
  if (!label) throw new Error('Enter a device label.');
  const kioskId = Utilities.getUuid();
  getSheet_(APP.sheets.kiosks).appendRow([kioskId, label, '', false, now_(), '', '']);
  const token = createLink_('KIOSK', '', kioskId, APP.activationLinkMinutes * 60 * 1000);
  const url = `${getWebAppUrl_()}?mode=activate&token=${encodeURIComponent(token)}`;
  const html = HtmlService.createHtmlOutput(
    `<div style="font:14px Arial;padding:20px;color:#171717"><p style="margin-top:0">Open this link on <strong>${escapeHtml_(label)}</strong> within 15 minutes.</p><p><a href="${escapeHtml_(url)}" target="_blank">Activate kiosk</a></p><textarea style="width:100%;height:90px">${escapeHtml_(url)}</textarea></div>`
  ).setWidth(520).setHeight(230);
  ui.showModalDialog(html, 'Kiosk activation');
  audit_('CREATE_KIOSK_LINK', kioskId, label);
}

function activateKiosk(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const link = findLink_('KIOSK', token);
    if (!link) return { ok: false, message: 'This activation link is invalid or expired.' };
    const sheet = getSheet_(APP.sheets.kiosks);
    const row = findKioskRow_(link.kioskId);
    if (!row) return { ok: false, message: 'Kiosk not found.' };
    const secret = randomToken_();
    sheet.getRange(row, 3).setValue(sha256_(secret));
    sheet.getRange(row, 4).setValue(true);
    sheet.getRange(row, 6).clearContent();
    consumeLink_(link);
    audit_('ACTIVATE_KIOSK', link.kioskId, sheet.getRange(row, 2).getValue());
    return { ok: true, credential: `${link.kioskId}.${secret}` };
  } finally {
    lock.releaseLock();
  }
}

function revokeKiosk() {
  const sheet = getSheet_(APP.sheets.kiosks);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const active = rows.filter((row) => row[3] === true).map((row) => String(row[1]));
  if (!active.length) {
    SpreadsheetApp.getUi().alert('No active kiosks.');
    return;
  }
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Revoke kiosk', `Enter a device label:\n${active.join('\n')}`, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const label = response.getResponseText().trim();
  const matchIndex = rows.findIndex((row) => row[3] === true && String(row[1]) === label);
  if (matchIndex < 0) throw new Error('Active kiosk label not found.');
  const rowNumber = matchIndex + 2;
  sheet.getRange(rowNumber, 4).setValue(false);
  sheet.getRange(rowNumber, 6).setValue(now_());
  audit_('REVOKE_KIOSK', String(rows[matchIndex][0]), label);
  ui.alert(`${label} revoked.`);
}

function requireKiosk_(credential) {
  const parts = String(credential || '').split('.');
  if (parts.length !== 2) throw new Error('This device is not an authorized kiosk.');
  const [id, secret] = parts;
  const row = findKioskRow_(id);
  if (!row) throw new Error('This device is not an authorized kiosk.');
  const sheet = getSheet_(APP.sheets.kiosks);
  const values = sheet.getRange(row, 1, 1, 7).getValues()[0];
  if (values[3] !== true || !sameString_(values[2], sha256_(secret))) {
    throw new Error('This kiosk has been revoked.');
  }
  sheet.getRange(row, 7).setValue(now_());
  return { id, label: String(values[1]) };
}

function findKioskRow_(id) {
  const sheet = getSheet_(APP.sheets.kiosks);
  if (sheet.getLastRow() < 2) return null;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
  const index = ids.indexOf(String(id));
  return index < 0 ? null : index + 2;
}

function escapeHtml_(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function maskEmail_(email) {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}
