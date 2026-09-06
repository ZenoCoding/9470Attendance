# Team 9470 Attendance

A self-service attendance kiosk for Team 9470, built with Google Apps Script and Google Sheets.

Students select their name and enter a four-digit PIN on an authorized workshop device. On a supervised opening day, students without a PIN can create one at the kiosk and check in in the same step. One check-in per day counts. The first visit in a required week satisfies that week; additional visits can repay older missed weeks but cannot prepay future weeks.

## 2026–27 calendar

- Season begins: August 29, 2026
- First required week: August 31–September 6, 2026
- Provisional final required week: March 29–April 4, 2027
- Excluded: November 23–29, December 21–27, and December 28–January 3
- Required weeks: 28

The final week is provisionally the week before FIRST's 2027 Week 6 window, when Northern California is expected to hold its District Championship. Update the `Weeks` sheet when the official California schedule is published.

## Install

1. Install the pinned project tooling:

   ```sh
   npm install
   ```

2. Sign in to the team Google account:

   ```sh
   npm run google:login
   ```

3. Create a container-bound Sheets project and push the source:

   ```sh
   npm run google:create
   ```

   The helper preserves this project's manifest because `clasp create` may generate its own copy.

4. Open the spreadsheet, reload it, and choose `Attendance → Setup workbook`.
5. In `Roster`, paste each student's full name. Email is optional. Choose `Attendance → Validate roster`.
6. Open `Extensions → Apps Script`, then choose `Deploy → New deployment → Web app`.
   - Execute as: the team Google account
   - Who has access: anyone
7. Reload the spreadsheet. If you already have student emails, choose `Attendance → Send PIN setup emails`. The confirmation lists how many links will be sent and names students who still have neither an email nor a PIN. Sending a fresh link invalidates older setup links.
8. Choose `Attendance → Create kiosk activation link`, open the link on the kiosk, and activate it.
9. For supervised in-person onboarding, choose `Attendance → Start supervised PIN setup`. Students without a PIN can create and confirm one; saving the PIN also records that day's check-in. Setup remains open until a leader chooses `End supervised PIN setup`, so keep a leader with the kiosk and close it when finished.

Use a team-controlled Google account. Do not transfer the Apps Script project to a different domain without redeploying the web app.

## Leader workflow

- `Dashboard` contains the formatted attendance summary through the last completed week.
- `Roster` is the canonical student list. Full names must be unique; email is optional. After changing it, run `Validate roster`.
- `Start supervised PIN setup` opens enrollment until a leader chooses `End supervised PIN setup`. While it is open, an unclaimed roster name can create a PIN, so a leader must supervise the kiosk and close setup when finished.
- `Reset a student PIN` clears a forgotten PIN. Start supervised PIN setup when that student is present so they can create a replacement.
- `Weeks` controls required and excluded weeks.
- `Adjustments` is only for kiosk failures or administrative corrections. Enter a date, exact roster name, `Credit` or `Reverse`, and a reason; then run `Process adjustments`. Processed rows retain the student's hidden ID so later name corrections do not lose the credit.
- Setup and reset links expire after seven days and work once.
- A kiosk locks one student's PIN entry for one minute after five failures.
- Revoke a lost or repurposed device through `Attendance → Revoke a kiosk`.

Internal records are kept in protected hidden sheets. PINs are salted and keyed before storage; readable PINs are never stored.

## Local checks

```sh
npm test
npm run preview
```

The preview command creates `output/playwright/kiosk-preview.html` for visual inspection. It does not contact Google or modify attendance data.
