const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync('src/AttendanceCore.gs', 'utf8'), context);

const calculate = context.calculateAttendance_;
const allowedPin = context.isAllowedPin_;
const normalizeRoster = context.normalizeRosterEntries_;
const setupEnabled = context.isPinSetupEnabledValue_;
const validatePinSetup = context.validatePinSetupSubmission_;

function weeks(keys, excluded = []) {
  return keys.map((key) => ({ key, required: !excluded.includes(key) }));
}

const three = weeks(['2026-08-31', '2026-09-07', '2026-09-14']);

assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(three, { '2026-08-31': 3 }, '2026-08-31', '', '2026-09-21'))),
  { requiredWeeks: 3, creditedVisits: 1, outstanding: 2, percentage: 33, currentStatus: 'Not required' },
  'extra early visits must not prepay future weeks'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(three, { '2026-08-31': 1, '2026-09-14': 2 }, '2026-08-31', '', '2026-09-21'))),
  { requiredWeeks: 3, creditedVisits: 3, outstanding: 0, percentage: 100, currentStatus: 'Not required' },
  'an extra later visit should repay the oldest missed week'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(three, { '2026-08-31': 1 }, '2026-08-31', '', '2026-09-07'))),
  { requiredWeeks: 1, creditedVisits: 1, outstanding: 0, percentage: 100, currentStatus: 'Not yet' },
  'the current week must not enter the percentage denominator'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(three, { '2026-09-07': 2 }, '2026-08-31', '', '2026-09-07'))),
  { requiredWeeks: 1, creditedVisits: 1, outstanding: 0, percentage: 100, currentStatus: 'Attended' },
  'the current week first visit is reserved and the second can repay debt'
);

const withExcluded = weeks(['2026-08-31', '2026-09-07', '2026-09-14'], ['2026-09-07']);
assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(withExcluded, { '2026-09-07': 1 }, '2026-08-31', '', '2026-09-21'))),
  { requiredWeeks: 2, creditedVisits: 1, outstanding: 1, percentage: 50, currentStatus: 'Not required' },
  'a visit in an excluded week should repay existing debt but create no obligation'
);

['1234', '4321', '9470', '0000', '7777', '1212', '999', 'abcd'].forEach((pin) => {
  assert.equal(allowedPin(pin), false, `${pin} should be rejected`);
});
['5837', '2048', '9001'].forEach((pin) => assert.equal(allowedPin(pin), true, `${pin} should be allowed`));

assert.deepEqual(
  JSON.parse(JSON.stringify(normalizeRoster([
    ['  Alex Student  ', '', '', '', 'Active'],
    ['Jamie Student', 'JAMIE@EXAMPLE.COM'],
    ['', '']
  ]))).map(({ name, email, sheetRow }) => ({ name, email, sheetRow })),
  [
    { name: 'Alex Student', email: '', sheetRow: 2 },
    { name: 'Jamie Student', email: 'jamie@example.com', sheetRow: 3 }
  ],
  'roster validation must accept names without email and normalize supplied emails'
);
assert.throws(
  () => normalizeRoster([['Alex Student', 'not-an-email']]),
  /valid email or leave it blank/,
  'invalid nonblank emails must still be rejected'
);
assert.throws(
  () => normalizeRoster([['Alex Student', ''], ['alex student', '']]),
  /duplicate full name/,
  'full names must be unique when email is optional'
);
assert.throws(
  () => normalizeRoster([['Alex Student', 'shared@example.com'], ['Jamie Student', 'SHARED@example.com']]),
  /duplicate email/,
  'supplied emails must remain unique'
);

assert.equal(setupEnabled('true'), true, 'explicitly enabled setup state must be open');
assert.equal(setupEnabled('false'), false, 'disabled setup state must be closed');
assert.equal(setupEnabled(''), false, 'missing setup state must be closed');
assert.equal(validatePinSetup('5837', '5837'), '', 'a matching strong PIN should be accepted');
assert.match(validatePinSetup('5837', '5838'), /do not match/, 'PIN confirmation must match');
assert.match(validatePinSetup('1234', '1234'), /less predictable/, 'weak PINs must be rejected during kiosk setup');

assert.deepEqual(
  JSON.parse(JSON.stringify(calculate(three, { '2026-09-14': 1 }, '2026-09-14', '', '2026-09-21'))),
  { requiredWeeks: 1, creditedVisits: 1, outstanding: 0, percentage: 100, currentStatus: 'Not required' },
  'students must not owe attendance before their first required Monday'
);

const excluded = new Set(['2026-11-23', '2026-12-21', '2026-12-28']);
let cursor = new Date('2026-08-31T12:00:00Z');
const finalMonday = '2027-03-29';
let calendarWeeks = 0;
let requiredCalendarWeeks = 0;
while (cursor.toISOString().slice(0, 10) <= finalMonday) {
  const key = cursor.toISOString().slice(0, 10);
  calendarWeeks += 1;
  if (!excluded.has(key)) requiredCalendarWeeks += 1;
  cursor.setUTCDate(cursor.getUTCDate() + 7);
}
assert.equal(calendarWeeks, 31, 'season should span 31 Monday–Sunday weeks');
assert.equal(requiredCalendarWeeks, 28, 'three holiday exclusions should leave 28 required weeks');

console.log('attendance tests passed');
