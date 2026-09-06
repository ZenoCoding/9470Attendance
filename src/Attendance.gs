function findStudentRow_(studentId) {
  const sheet = getSheet_(APP.sheets.students);
  if (sheet.getLastRow() < 2) return null;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
  const index = ids.indexOf(String(studentId));
  return index < 0 ? null : index + 2;
}

function getStudentById_(studentId) {
  const row = findStudentRow_(studentId);
  if (!row) return null;
  const internal = getSheet_(APP.sheets.students).getRange(row, 1, 1, 7).getValues()[0];
  const roster = getRosterById_(studentId);
  if (!roster) return null;
  return {
    id: String(internal[0]),
    email: String(internal[1]),
    name: String(internal[2]),
    pinSalt: String(internal[3] || ''),
    pinHash: String(internal[4] || ''),
    startDate: roster.startDate,
    endDate: roster.endDate,
    active: roster.status === 'Active'
  };
}

function getRosterById_(studentId) {
  const sheet = getSheet_(APP.sheets.roster);
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const row = rows.find((item) => String(item[7]) === String(studentId));
  if (!row) return null;
  return {
    name: String(row[0]),
    email: normalizeEmail_(row[1]),
    startDate: row[2] instanceof Date ? dateKey_(row[2]) : APP.seasonStart,
    endDate: row[3] instanceof Date ? dateKey_(row[3]) : '',
    status: String(row[4] || 'Active')
  };
}

function getRosterModels_() {
  const sheet = getSheet_(APP.sheets.roster);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter((row) => row[0] && row[7])
    .map((row) => ({
      id: String(row[7]),
      name: String(row[0]).trim(),
      email: normalizeEmail_(row[1]),
      startDate: row[2] instanceof Date ? dateKey_(row[2]) : APP.seasonStart,
      endDate: row[3] instanceof Date ? dateKey_(row[3]) : '',
      status: String(row[4] || 'Active'),
      pinStatus: String(row[5] || 'Not set')
    }));
}

function updateRosterPinStatus_(studentId, status) {
  const sheet = getSheet_(APP.sheets.roster);
  if (sheet.getLastRow() < 2) return;
  const ids = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
  const index = ids.indexOf(String(studentId));
  if (index >= 0) sheet.getRange(index + 2, 6).setValue(status);
}

function listStudents(kioskCredential) {
  requireKiosk_(kioskCredential);
  const today = dateKey_(now_());
  const checkedInToday = acceptedStudentIdsForDay_(today);
  return getRosterModels_()
    .filter((student) => student.status === 'Active' && (!student.endDate || student.endDate >= today))
    .map((student) => ({
      id: student.id,
      name: student.name,
      hasEmail: Boolean(student.email),
      pinSet: student.pinStatus === 'Set',
      checkedInToday: checkedInToday.has(student.id)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getPinSetupStatus(kioskCredential) {
  requireKiosk_(kioskCredential);
  const enabled = isPinSetupModeActive_();
  return {
    enabled,
    until: '',
    message: enabled ? 'Supervised PIN setup is open until a leader ends it.' : ''
  };
}

function acceptedStudentIdsForDay_(day) {
  const sheet = getSheet_(APP.sheets.checkins);
  if (sheet.getLastRow() < 2) return new Set();
  return new Set(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues()
      .filter((row) => row[3] === day && row[7] === 'Accepted')
      .map((row) => row[1])
  );
}

function submitCheckIn(studentId, pin, kioskCredential) {
  const kiosk = requireKiosk_(kioskCredential);
  const student = getStudentById_(studentId);
  if (!student || !student.active) return { ok: false, code: 'UNAVAILABLE', message: 'Student not available.' };
  if (!student.pinHash) return { ok: false, code: 'NO_PIN', message: 'PIN not set. Ask a leader to start supervised PIN setup.' };

  const cache = CacheService.getScriptCache();
  const lockKey = `pin-lock:${student.id}`;
  const lockUntil = Number(cache.get(lockKey) || 0);
  if (lockUntil > Date.now()) {
    return { ok: false, code: 'LOCKED', message: 'Too many attempts. Try again in one minute.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!sameString_(student.pinHash, hashPin_(String(pin || ''), student.pinSalt))) {
      const attemptsKey = `pin-attempts:${student.id}`;
      const attempts = Number(cache.get(attemptsKey) || 0) + 1;
      if (attempts >= APP.failedPinLimit) {
        cache.remove(attemptsKey);
        cache.put(lockKey, String(Date.now() + APP.lockoutSeconds * 1000), APP.lockoutSeconds);
        audit_('PIN_LOCKOUT', student.id, kiosk.id);
        return { ok: false, code: 'LOCKED', message: 'Too many attempts. Try again in one minute.' };
      }
      cache.put(attemptsKey, String(attempts), 300);
      return { ok: false, code: 'WRONG_PIN', message: 'Incorrect PIN.' };
    }

    cache.remove(`pin-attempts:${student.id}`);
    cache.remove(lockKey);
    return recordAcceptedCheckIn_(student, kiosk, 'PIN');
  } finally {
    lock.releaseLock();
  }
}

function setupPinAndCheckIn(studentId, pin, confirmation, kioskCredential) {
  const kiosk = requireKiosk_(kioskCredential);
  const validationError = validatePinSetupSubmission_(pin, confirmation);
  if (validationError) return { ok: false, code: 'INVALID_PIN', message: validationError };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!isPinSetupModeActive_()) {
      return { ok: false, code: 'SETUP_CLOSED', message: 'PIN setup is closed. Ask a leader for help.' };
    }
    const student = getStudentById_(studentId);
    if (!student || !student.active) return { ok: false, code: 'UNAVAILABLE', message: 'Student not available.' };
    if (student.pinHash) {
      return { ok: false, code: 'PIN_ALREADY_SET', message: 'A PIN is already set. Enter it to check in.' };
    }
    const row = findStudentRow_(student.id);
    if (!row) return { ok: false, code: 'UNAVAILABLE', message: 'Student record not found.' };
    const salt = randomToken_();
    const students = getSheet_(APP.sheets.students);
    const createdAt = students.getRange(row, 6).getValue() || now_();
    students.getRange(row, 4, 1, 4).setValues([[salt, hashPin_(String(pin), salt), createdAt, now_()]]);
    invalidatePinLinksForStudent_(student.id);
    updateRosterPinStatus_(student.id, 'Set');
    audit_('SET_PIN_AT_KIOSK', student.id, kiosk.label);
    const result = recordAcceptedCheckIn_(student, kiosk, 'PIN_SETUP');
    result.pinCreated = true;
    return result;
  } finally {
    lock.releaseLock();
  }
}

function recordAcceptedCheckIn_(student, kiosk, method) {
  const timestamp = now_();
  const day = dateKey_(timestamp);
  if (hasAcceptedCheckIn_(student.id, day)) {
    refreshDashboard();
    return { ok: true, code: 'ALREADY', name: student.name, message: 'Already checked in today.' };
  }
  getSheet_(APP.sheets.checkins).appendRow([
    Utilities.getUuid(), student.id, timestamp, day, mondayKey_(timestamp), kiosk.id, method, 'Accepted'
  ]);
  audit_('CHECK_IN', student.id, `${day} via ${kiosk.label}`);
  refreshDashboard();
  return { ok: true, code: 'RECORDED', name: student.name, time: timeLabel_(timestamp), message: 'Attendance recorded.' };
}

function hasAcceptedCheckIn_(studentId, day) {
  const sheet = getSheet_(APP.sheets.checkins);
  if (sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
  return rows.some((row) => row[1] === String(studentId) && row[3] === day && row[7] === 'Accepted');
}

function readWeeks_() {
  const sheet = getSheet_(APP.sheets.weeks);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter((row) => row[0] instanceof Date)
    .map((row) => ({ key: dateKey_(row[0]), required: row[1] === true, note: String(row[2] || '') }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function readVisitData_() {
  const visitsByStudentDay = new Map();
  const lastCheckIn = new Map();
  const checkins = getSheet_(APP.sheets.checkins);
  if (checkins.getLastRow() > 1) {
    checkins.getRange(2, 1, checkins.getLastRow() - 1, 8).getValues().forEach((row) => {
      if (row[7] !== 'Accepted') return;
      const studentId = String(row[1]);
      const day = String(row[3]);
      visitsByStudentDay.set(`${studentId}|${day}`, 1);
      if (row[2] instanceof Date && (!lastCheckIn.has(studentId) || row[2] > lastCheckIn.get(studentId))) {
        lastCheckIn.set(studentId, row[2]);
      }
    });
  }

  const adjustments = getSheet_(APP.sheets.adjustments);
  if (adjustments.getLastRow() > 1) {
    const roster = getRosterModels_();
    const byName = new Map(roster.map((student) => [student.name, student.id]));
    adjustments.getRange(2, 1, adjustments.getLastRow() - 1, 8).getValues().forEach((row) => {
      if (row[6] !== 'Processed' || !(row[0] instanceof Date)) return;
      const studentId = String(row[7] || '') || byName.get(String(row[1]));
      if (!studentId) return;
      const key = `${studentId}|${dateKey_(row[0])}`;
      const delta = row[2] === 'Credit' ? 1 : -1;
      visitsByStudentDay.set(key, Math.max(0, Number(visitsByStudentDay.get(key) || 0) + delta));
    });
  }

  const visitsByStudentWeek = new Map();
  visitsByStudentDay.forEach((count, compound) => {
    if (count <= 0) return;
    const [studentId, day] = compound.split('|');
    const week = mondayKey_(parseDateKey_(day));
    if (!visitsByStudentWeek.has(studentId)) visitsByStudentWeek.set(studentId, {});
    const weekly = visitsByStudentWeek.get(studentId);
    weekly[week] = Number(weekly[week] || 0) + 1;
  });
  return { visitsByStudentWeek, lastCheckIn };
}

function refreshDashboard() {
  const sheet = getSheet_(APP.sheets.dashboard);
  const weeks = readWeeks_();
  const currentWeek = mondayKey_(now_());
  const { visitsByStudentWeek, lastCheckIn } = readVisitData_();
  const today = dateKey_(now_());
  const rows = getRosterModels_()
    .filter((student) => student.status === 'Active' && (!student.endDate || student.endDate >= today))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((student) => {
      const startWeek = firstMondayOnOrAfter_(parseDateKey_(student.startDate));
      const result = calculateAttendance_(
        weeks,
        visitsByStudentWeek.get(student.id) || {},
        startWeek,
        student.endDate,
        currentWeek
      );
      const currentStatus = currentWeek < startWeek ? 'Not started' : result.currentStatus;
      return [
        student.name,
        result.percentage / 100,
        currentStatus,
        result.requiredWeeks,
        result.creditedVisits,
        result.outstanding,
        lastCheckIn.get(student.id) || '',
        student.pinStatus
      ];
    });

  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.Dashboard.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.Dashboard.length).setValues(rows);
  applyDashboardFormatting_();
}

function processAdjustments() {
  const sheet = getSheet_(APP.sheets.adjustments);
  if (sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No adjustments to process.');
    return;
  }
  const rosterNames = new Set(getRosterModels_().map((student) => student.name));
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const rosterByName = new Map(getRosterModels_().map((student) => [student.name, student]));
  let processed = 0;
  rows.forEach((row, index) => {
    if (row[6] === 'Processed' || row.every((value) => !value)) return;
    if (!(row[0] instanceof Date)) throw new Error(`Adjustments row ${index + 2}: enter a date.`);
    if (!rosterNames.has(String(row[1]))) throw new Error(`Adjustments row ${index + 2}: student name must exactly match the roster.`);
    if (!['Credit', 'Reverse'].includes(String(row[2]))) throw new Error(`Adjustments row ${index + 2}: choose Credit or Reverse.`);
    if (!String(row[3] || '').trim()) throw new Error(`Adjustments row ${index + 2}: enter a reason.`);
    const student = rosterByName.get(String(row[1]));
    sheet.getRange(index + 2, 5, 1, 4).setValues([[now_(), actorEmail_(), 'Processed', student.id]]);
    audit_('ADJUST_ATTENDANCE', student.id, `${row[2]} ${dateKey_(row[0])}: ${row[3]}`);
    processed += 1;
  });
  refreshDashboard();
  SpreadsheetApp.getUi().alert(`Processed ${processed} adjustment${processed === 1 ? '' : 's'}.`);
}
