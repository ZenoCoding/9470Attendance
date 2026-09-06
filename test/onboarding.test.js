const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let setupOpen = false;
let student = null;
let storedPin = null;
let rosterStatus = null;
let auditAction = null;
let checkInMethod = null;
let lockWaited = false;
let lockReleased = false;
let invalidatedStudentId = null;

const studentSheet = {
  getRange(row, column, rowCount, columnCount) {
    assert.equal(row, 2);
    if (column === 6) return { getValue: () => new Date('2026-08-01T12:00:00Z') };
    assert.deepEqual([column, rowCount, columnCount], [4, 1, 4]);
    return { setValues: (values) => { storedPin = values[0]; } };
  }
};

const context = vm.createContext({
  APP: { sheets: { students: '_Students' } },
  LockService: {
    getScriptLock: () => ({
      waitLock: () => { lockWaited = true; },
      releaseLock: () => { lockReleased = true; }
    })
  },
  requireKiosk_: () => ({ id: 'kiosk-1', label: 'Workshop Tablet' }),
  isPinSetupModeActive_: () => setupOpen,
  getStudentById_: () => student,
  findStudentRow_: () => 2,
  randomToken_: () => 'salt',
  getSheet_: () => studentSheet,
  hashPin_: (pin, salt) => `hash:${salt}:${pin}`,
  now_: () => new Date('2026-08-28T17:00:00Z'),
  updateRosterPinStatus_: (_id, status) => { rosterStatus = status; },
  invalidatePinLinksForStudent_: (id) => { invalidatedStudentId = id; },
  audit_: (action) => { auditAction = action; },
  recordAcceptedCheckIn_: (_student, _kiosk, method) => {
    checkInMethod = method;
    return { ok: true, code: 'RECORDED', name: _student.name, message: 'Attendance recorded.' };
  }
});

vm.runInContext(fs.readFileSync('src/AttendanceCore.gs', 'utf8'), context);
vm.runInContext(fs.readFileSync('src/Attendance.gs', 'utf8'), context);
context.getStudentById_ = () => student;
context.findStudentRow_ = () => 2;
context.updateRosterPinStatus_ = (_id, status) => { rosterStatus = status; };
context.invalidatePinLinksForStudent_ = (id) => { invalidatedStudentId = id; };
context.recordAcceptedCheckIn_ = (_student, _kiosk, method) => {
  checkInMethod = method;
  return { ok: true, code: 'RECORDED', name: _student.name, message: 'Attendance recorded.' };
};

function reset() {
  student = { id: 'student-1', name: 'Alex Student', active: true, pinHash: '', pinSalt: '' };
  storedPin = null;
  rosterStatus = null;
  auditAction = null;
  checkInMethod = null;
  lockWaited = false;
  lockReleased = false;
  invalidatedStudentId = null;
}

reset();
setupOpen = false;
assert.deepEqual(
  JSON.parse(JSON.stringify(context.setupPinAndCheckIn('student-1', '5837', '5837', 'credential'))),
  { ok: false, code: 'SETUP_CLOSED', message: 'PIN setup is closed. Ask a leader for help.' }
);
assert.equal(storedPin, null, 'closed setup must not write a PIN');
assert.equal(checkInMethod, null, 'closed setup must not record attendance');
assert.equal(lockWaited, true);
assert.equal(lockReleased, true);

reset();
setupOpen = true;
student.pinHash = 'existing-hash';
assert.equal(
  context.setupPinAndCheckIn('student-1', '5837', '5837', 'credential').code,
  'PIN_ALREADY_SET',
  'a concurrent setup must not overwrite an existing PIN'
);
assert.equal(storedPin, null);

reset();
setupOpen = true;
const result = context.setupPinAndCheckIn('student-1', '5837', '5837', 'credential');
assert.equal(result.ok, true);
assert.equal(result.pinCreated, true);
assert.deepEqual(
  Array.from(storedPin, (value) => value instanceof Date ? value.toISOString() : value),
  ['salt', 'hash:salt:5837', '2026-08-01T12:00:00.000Z', '2026-08-28T17:00:00.000Z']
);
assert.equal(rosterStatus, 'Set');
assert.equal(invalidatedStudentId, 'student-1');
assert.equal(auditAction, 'SET_PIN_AT_KIOSK');
assert.equal(checkInMethod, 'PIN_SETUP');
assert.equal(lockReleased, true);

console.log('onboarding tests passed');
