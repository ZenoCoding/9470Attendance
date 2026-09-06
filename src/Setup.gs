const HEADERS = Object.freeze({
  Dashboard: ['Full name', 'Attendance', 'This week', 'Required weeks', 'Credited visits', 'Outstanding', 'Last check-in', 'PIN'],
  Roster: ['Full name', 'Email', 'Start date', 'End date', 'Status', 'PIN', 'Setup email', 'Student ID'],
  Weeks: ['Week of', 'Required', 'Note'],
  Adjustments: ['Date', 'Student', 'Action', 'Reason', 'Recorded at', 'Recorded by', 'Status', 'Student ID'],
  _Students: ['Student ID', 'Email', 'Full name', 'PIN salt', 'PIN hash', 'Created at', 'Updated at'],
  _Checkins: ['Check-in ID', 'Student ID', 'Timestamp', 'Date', 'Week', 'Kiosk ID', 'Method', 'Status'],
  _Kiosks: ['Kiosk ID', 'Label', 'Secret hash', 'Active', 'Created at', 'Revoked at', 'Last seen'],
  _Links: ['Type', 'Token hash', 'Student ID', 'Kiosk ID', 'Expires at', 'Used at', 'Created at'],
  _Audit: ['Timestamp', 'Actor', 'Action', 'Entity ID', 'Details']
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Attendance')
    .addItem('Setup workbook', 'setupWorkbook')
    .addSeparator()
    .addItem('Validate roster', 'validateRoster')
    .addItem('Send PIN setup emails', 'sendPinSetupEmails')
    .addItem('Start supervised PIN setup', 'startPinSetupMode')
    .addItem('End supervised PIN setup', 'endPinSetupMode')
    .addItem('Reset a student PIN', 'resetStudentPin')
    .addItem('Refresh dashboard', 'refreshDashboard')
    .addItem('Process adjustments', 'processAdjustments')
    .addSeparator()
    .addItem('Create kiosk activation link', 'createKioskActivationLink')
    .addItem('Revoke a kiosk', 'revokeKiosk')
    .addToUi();
}

function setupWorkbook() {
  ensureSecret_();
  const spreadsheet = getSpreadsheet_();
  const visibleNames = [APP.sheets.dashboard, APP.sheets.roster, APP.sheets.weeks, APP.sheets.adjustments];
  const internalNames = [APP.sheets.students, APP.sheets.checkins, APP.sheets.kiosks, APP.sheets.links, APP.sheets.audit];

  [...visibleNames, ...internalNames].forEach((name) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    ensureHeaders_(sheet, HEADERS[name]);
  });

  seedWeeks_();
  formatWorkbook_();
  protectInternalSheets_(internalNames);
  internalNames.forEach((name) => spreadsheet.getSheetByName(name).hideSheet());
  visibleNames.forEach((name, index) => {
    spreadsheet.setActiveSheet(spreadsheet.getSheetByName(name));
    spreadsheet.moveActiveSheet(index + 1);
  });
  removeBlankExtraSheets_([...visibleNames, ...internalNames]);
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName(APP.sheets.dashboard));
  refreshDashboard();
  audit_('SETUP_WORKBOOK', '', APP.seasonLabel);
  SpreadsheetApp.getUi().alert('Attendance workbook is ready.');
}

function removeBlankExtraSheets_(expectedNames) {
  const spreadsheet = getSpreadsheet_();
  spreadsheet.getSheets().forEach((sheet) => {
    if (!expectedNames.includes(sheet.getName()) && sheet.getLastRow() === 0 && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  });
}

function protectInternalSheets_(names) {
  names.forEach((name) => {
    const sheet = getSheet_(name);
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    const protection = existing[0] || sheet.protect().setDescription('Attendance system data');
    protection.setWarningOnly(true);
  });
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const range = sheet.getRange(1, 1, 1, headers.length);
  const current = range.getDisplayValues()[0];
  if (current.every((value) => !value)) range.setValues([headers]);
}

function seedWeeks_() {
  const sheet = getSheet_(APP.sheets.weeks);
  if (sheet.getLastRow() > 1) return;
  const rows = [];
  let key = APP.firstRequiredMonday;
  while (key <= APP.lastRequiredMonday) {
    const note = APP.excludedWeeks[key] || '';
    rows.push([parseDateKey_(key), !note, note]);
    key = addDaysKey_(key, 7);
  }
  if (rows.length) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function formatWorkbook_() {
  const spreadsheet = getSpreadsheet_();
  spreadsheet.setSpreadsheetTimeZone(APP.timezone);

  const layouts = {
    Dashboard: [220, 105, 115, 120, 115, 105, 125, 100],
    Roster: [220, 250, 115, 115, 100, 100, 145, 120],
    Weeks: [125, 95, 240],
    Adjustments: [120, 220, 110, 320, 155, 220, 110, 120]
  };

  Object.keys(layouts).forEach((name) => {
    const sheet = getSheet_(name);
    sheet.setFrozenRows(1);
    sheet.setHiddenGridlines(true);
    sheet.setTabColor(name === 'Dashboard' ? COLORS.accent : COLORS.ink);
    const columns = layouts[name];
    columns.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
    const header = sheet.getRange(1, 1, 1, columns.length);
    header
      .setBackground(COLORS.ink)
      .setFontColor(COLORS.paper)
      .setFontWeight('bold')
      .setFontSize(10)
      .setVerticalAlignment('middle');
    sheet.setRowHeight(1, 34);
    if (sheet.getMaxRows() > 1) {
      sheet.getRange(2, 1, sheet.getMaxRows() - 1, columns.length)
        .setFontFamily('Arial')
        .setFontSize(10)
        .setVerticalAlignment('middle');
    }
  });

  const roster = getSheet_(APP.sheets.roster);
  roster.hideColumns(8);
  roster.getRange('C2:D').setNumberFormat('mmm d, yyyy');
  roster.getRange('E2:E').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive'], true).build()
  );
  if (!roster.getFilter()) roster.getRange(1, 1, roster.getMaxRows(), 7).createFilter();

  const weeks = getSheet_(APP.sheets.weeks);
  weeks.getRange('A2:A').setNumberFormat('mmm d, yyyy');
  weeks.getRange('B2:B').insertCheckboxes();

  const adjustments = getSheet_(APP.sheets.adjustments);
  if (!adjustments.getRange(1, 8).getValue()) adjustments.getRange(1, 8).setValue('Student ID');
  adjustments.hideColumns(8);
  adjustments.getRange('A2:A').setNumberFormat('mmm d, yyyy');
  adjustments.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Credit', 'Reverse'], true).build()
  );
  adjustments.getRange('E2:E').setNumberFormat('mmm d, yyyy h:mm am/pm');
  if (!adjustments.getFilter()) adjustments.getRange(1, 1, adjustments.getMaxRows(), 7).createFilter();

  applyDashboardFormatting_();
}

function applyDashboardFormatting_() {
  const sheet = getSheet_(APP.sheets.dashboard);
  sheet.getRange('B2:B').setNumberFormat('0%');
  sheet.getRange('D2:F').setNumberFormat('0');
  sheet.getRange('G2:G').setNumberFormat('mmm d, yyyy');
  const dataRange = sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), HEADERS.Dashboard.length);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Attended')
      .setBackground(COLORS.successSoft)
      .setFontColor(COLORS.success)
      .setRanges([sheet.getRange('C2:C')])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Not yet')
      .setBackground(COLORS.warningSoft)
      .setFontColor(COLORS.warning)
      .setRanges([sheet.getRange('C2:C')])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground(COLORS.dangerSoft)
      .setFontColor(COLORS.accentDark)
      .setRanges([sheet.getRange('F2:F')])
      .build()
  ];
  sheet.setConditionalFormatRules(rules);
  sheet.getBandings().forEach((banding) => banding.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.Dashboard.length).createFilter();
}

function validateRoster() {
  const result = syncRoster_();
  refreshDashboard();
  SpreadsheetApp.getUi().alert(`Roster valid: ${result.active} active student${result.active === 1 ? '' : 's'}.`);
}

function syncRoster_() {
  const roster = getSheet_(APP.sheets.roster);
  const students = getSheet_(APP.sheets.students);
  const rosterRows = roster.getLastRow() < 2 ? [] : roster.getRange(2, 1, roster.getLastRow() - 1, 8).getValues();
  const studentRows = students.getLastRow() < 2 ? [] : students.getRange(2, 1, students.getLastRow() - 1, 7).getValues();
  const byId = new Map(studentRows.map((row) => [String(row[0]), row]));
  const byEmail = new Map(studentRows.filter((row) => row[1]).map((row) => [normalizeEmail_(row[1]), row]));
  const byName = new Map(studentRows.map((row) => [String(row[2] || '').trim().toLocaleLowerCase(), row]));
  const output = [];
  const rosterIds = [];
  let active = 0;

  normalizeRosterEntries_(rosterRows).forEach((entry) => {
    const { row, sheetRow, name, email, nameKey } = entry;
    const [, , rawStart, , rawStatus] = row;
    const status = String(rawStatus || 'Active');
    if (!['Active', 'Inactive'].includes(status)) throw new Error(`Roster row ${sheetRow}: status must be Active or Inactive.`);
    if (status === 'Active') active += 1;

    const existing = byId.get(String(row[7] || '')) || (email ? byEmail.get(email) : null) || byName.get(nameKey);
    const id = existing ? String(existing[0]) : Utilities.getUuid();
    const createdAt = existing ? existing[5] : now_();
    const pinSalt = existing ? existing[3] : '';
    const pinHash = existing ? existing[4] : '';
    output.push([id, email, name, pinSalt, pinHash, createdAt, now_()]);
    rosterIds.push({ row: sheetRow, id, pinStatus: pinHash ? 'Set' : 'Not set' });

    if (!rawStart) roster.getRange(sheetRow, 3).setValue(parseDateKey_(APP.seasonStart));
    if (!rawStatus) roster.getRange(sheetRow, 5).setValue('Active');
  });

  if (students.getLastRow() > 1) students.getRange(2, 1, students.getLastRow() - 1, 7).clearContent();
  if (output.length) students.getRange(2, 1, output.length, 7).setValues(output);
  rosterIds.forEach((item) => {
    roster.getRange(item.row, 6).setValue(item.pinStatus);
    roster.getRange(item.row, 8).setValue(item.id);
  });
  audit_('SYNC_ROSTER', '', `${output.length} students`);
  return { total: output.length, active };
}

function pinSetupProperty_() {
  return 'PIN_SETUP_ENABLED';
}

function isPinSetupModeActive_() {
  return isPinSetupEnabledValue_(PropertiesService.getScriptProperties().getProperty(pinSetupProperty_()));
}

function startPinSetupMode() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Start supervised PIN setup?',
    'Any active student without a PIN can create one and check in at the kiosk until a leader ends setup mode. Keep a leader with the kiosk while this is enabled.',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('PIN_SETUP_UNTIL');
  properties.setProperty(pinSetupProperty_(), 'true');
  audit_('START_PIN_SETUP', '', 'Enabled by leader');
  ui.alert('Supervised PIN setup is open until a leader ends it. Reload the kiosk to show setup status.');
}

function endPinSetupMode() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(pinSetupProperty_());
  properties.deleteProperty('PIN_SETUP_UNTIL');
  audit_('END_PIN_SETUP', '', 'Ended by leader');
  SpreadsheetApp.getUi().alert('Supervised PIN setup is closed.');
}

function resetStudentPin() {
  syncRoster_();
  const ui = SpreadsheetApp.getUi();
  const active = getRosterModels_().filter((student) => student.status === 'Active');
  if (!active.length) {
    ui.alert('No active students.');
    return;
  }
  const response = ui.prompt(
    'Reset student PIN',
    `Enter the exact full name:\n${active.map((student) => student.name).join('\n')}`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const name = response.getResponseText().trim();
  const matches = active.filter((student) => student.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (matches.length !== 1) throw new Error('Enter one exact active roster name.');
  const student = matches[0];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = findStudentRow_(student.id);
    if (!row) throw new Error('Student record not found.');
    getSheet_(APP.sheets.students).getRange(row, 4, 1, 2).clearContent();
    invalidatePinLinksForStudent_(student.id);
    updateRosterPinStatus_(student.id, 'Not set');
    audit_('RESET_PIN', student.id, actorEmail_());
  } finally {
    lock.releaseLock();
  }
  refreshDashboard();
  ui.alert(`${student.name}'s PIN was cleared. Start supervised PIN setup when they are at the kiosk.`);
}

function audit_(action, entityId, details) {
  const sheet = getSheet_(APP.sheets.audit);
  sheet.appendRow([now_(), actorEmail_(), action, entityId || '', details || '']);
}
