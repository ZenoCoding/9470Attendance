/** Pure attendance calculation. Inputs use Monday date keys (YYYY-MM-DD). */
function calculateAttendance_(weeks, visitsByWeek, studentStartWeek, studentEndDate, currentWeek) {
  const debt = [];
  let requiredWeeks = 0;
  let currentStatus = 'Not required';

  weeks
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .forEach((week) => {
      if (week.key > currentWeek || week.key < studentStartWeek) return;
      if (studentEndDate && week.key > studentEndDate) return;

      let visits = Number(visitsByWeek[week.key] || 0);
      const isCurrent = week.key === currentWeek;

      if (!week.required) {
        if (isCurrent) currentStatus = 'Excluded';
        while (visits > 0 && debt.length > 0) {
          debt.shift();
          visits -= 1;
        }
        return;
      }

      if (isCurrent) {
        currentStatus = visits > 0 ? 'Attended' : 'Not yet';
        if (visits > 0) visits -= 1; // Reserve the first visit for this week.
        while (visits > 0 && debt.length > 0) {
          debt.shift();
          visits -= 1;
        }
        return;
      }

      requiredWeeks += 1;
      if (visits > 0) {
        visits -= 1; // First visit satisfies this week's obligation.
      } else {
        debt.push(week.key);
      }
      while (visits > 0 && debt.length > 0) {
        debt.shift();
        visits -= 1;
      }
    });

  const outstanding = debt.length;
  const creditedVisits = requiredWeeks - outstanding;
  const percentage = requiredWeeks === 0 ? 100 : Math.round((creditedVisits / requiredWeeks) * 100);
  return { requiredWeeks, creditedVisits, outstanding, percentage, currentStatus };
}

function isAllowedPin_(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) return false;
  if (/^(\d)\1{3}$/.test(pin)) return false;
  if (['1234', '4321', '9470'].includes(pin)) return false;
  if (pin.slice(0, 2) === pin.slice(2, 4)) return false;
  return true;
}

function normalizeRosterEntries_(rows) {
  const seenNames = new Set();
  const seenEmails = new Set();
  return rows.reduce((entries, row, index) => {
    const values = Array.isArray(row) ? row : [];
    const name = String(values[0] || '').trim();
    const email = String(values[1] || '').trim().toLowerCase();
    if (values.every((value) => !value)) return entries;
    if (!name) throw new Error(`Roster row ${index + 2}: enter a full name.`);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error(`Roster row ${index + 2}: enter a valid email or leave it blank.`);
    }
    const nameKey = name.toLocaleLowerCase();
    if (seenNames.has(nameKey)) throw new Error(`Roster row ${index + 2}: duplicate full name ${name}.`);
    if (email && seenEmails.has(email)) throw new Error(`Roster row ${index + 2}: duplicate email ${email}.`);
    seenNames.add(nameKey);
    if (email) seenEmails.add(email);
    entries.push({ row: values, sheetRow: index + 2, name, email, nameKey });
    return entries;
  }, []);
}

function isPinSetupEnabledValue_(value) {
  return String(value || '') === 'true';
}

function validatePinSetupSubmission_(pin, confirmation) {
  pin = String(pin || '');
  if (pin !== String(confirmation || '')) return 'PINs do not match.';
  if (!isAllowedPin_(pin)) return 'Choose a less predictable four-digit PIN.';
  return '';
}
