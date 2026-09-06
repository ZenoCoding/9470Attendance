const APP = Object.freeze({
  title: 'Attendance',
  teamName: 'Team 9470',
  timezone: 'America/Los_Angeles',
  seasonLabel: '2026–27',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbzv735wdRq8Uh1edrdzb_x4j1r7MLdekRYIEX3CGSH1ViOlFhMyJzA6sOhTr-fJgNm8/exec',
  seasonStart: '2026-08-29',
  firstRequiredMonday: '2026-08-31',
  lastRequiredMonday: '2027-03-29',
  excludedWeeks: Object.freeze({
    '2026-11-23': 'Thanksgiving',
    '2026-12-21': 'Winter break',
    '2026-12-28': 'Winter break'
  }),
  sheets: Object.freeze({
    dashboard: 'Dashboard',
    roster: 'Roster',
    weeks: 'Weeks',
    adjustments: 'Adjustments',
    students: '_Students',
    checkins: '_Checkins',
    kiosks: '_Kiosks',
    links: '_Links',
    audit: '_Audit'
  }),
  pinLinkHours: 24 * 7,
  activationLinkMinutes: 15,
  failedPinLimit: 5,
  lockoutSeconds: 60,
  successResetSeconds: 3,
  idleResetSeconds: 30
});

const COLORS = Object.freeze({
  ink: '#171717',
  muted: '#6B7280',
  paper: '#FFFFFF',
  canvas: '#F4F5F7',
  line: '#E5E7EB',
  accent: '#DC2626',
  accentDark: '#991B1B',
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#A16207',
  warningSoft: '#FEF3C7',
  dangerSoft: '#FEE2E2'
});

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    properties.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  const id = properties.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run Attendance → Setup workbook from the attendance spreadsheet first.');
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}. Run Attendance → Setup workbook.`);
  return sheet;
}

function ensureSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('PIN_PEPPER');
  if (!secret) {
    secret = randomToken_();
    properties.setProperty('PIN_PEPPER', secret);
  }
  return secret;
}

function randomToken_() {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${Utilities.getUuid()}:${Date.now()}:${Math.random()}`
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function hashPin_(pin, salt) {
  const bytes = Utilities.computeHmacSha256Signature(`${salt}:${pin}`, ensureSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function sameString_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function now_() {
  return new Date();
}

function dateKey_(date) {
  return Utilities.formatDate(date, APP.timezone, 'yyyy-MM-dd');
}

function timeLabel_(date) {
  return Utilities.formatDate(date, APP.timezone, 'h:mm a');
}

function parseDateKey_(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDaysKey_(key, days) {
  const date = parseDateKey_(key);
  date.setDate(date.getDate() + days);
  return dateKey_(date);
}

function mondayKey_(date) {
  const local = parseDateKey_(dateKey_(date));
  const day = local.getDay();
  local.setDate(local.getDate() - ((day + 6) % 7));
  return dateKey_(local);
}

function firstMondayOnOrAfter_(date) {
  const local = parseDateKey_(dateKey_(date));
  const day = local.getDay();
  const offset = day === 1 ? 0 : (8 - day) % 7;
  local.setDate(local.getDate() + offset);
  return dateKey_(local);
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function actorEmail_() {
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'unknown';
}
