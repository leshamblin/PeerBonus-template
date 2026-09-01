# Haroon MBA 590 Flag-Only Grading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config-selectable, non-punitive "flag-only" grading mode to the shared Peer Bonus template, then stand up an MBA 590 course copy (app + docs) that uses it.

**Architecture:** A new `grading_mode` Config value (`bonus_ratio` default, `flag_only` new) switches `generateGradebook()` between the existing continuous scheme and a new one where everyone scores 100 (A) and only students reviewed below `flag_threshold` (0.75) of the even split are flagged for the instructor. The row/flag math is extracted into a pure, Node-testable helper; the existing mode is preserved byte-for-byte so no running course changes behavior. MBA 590 is a standard template spin-up whose `config.js` sets `gradingMode: 'flag_only'`.

**Tech Stack:** Google Apps Script (V8), `clasp`, Node (built-in `assert` for local tests — no framework, no npm install), Google Sheets.

## Global Constraints

- **A = 100** on a 0–100 scale (the value that flows to Moodle). Copied verbatim from spec.
- **Flag threshold = 0.75** — flag iff `reviewsCount > 0` AND `bonusRatio < 0.75` (strict `<`). Never flag non-submitters, no-reviews-received, or solo teams.
- **Non-punitive:** `Submitted` (Yes/No) is informational only and must NOT affect Grade or Flag.
- **No student-app change:** `Index.html`, reflections, and the $1,000 dollar-allocation input/validation are untouched.
- **No behavior change for existing courses:** default mode `bonus_ratio` reproduces today's columns, formulas, and non-submitter=0 exactly.
- **Architecture = Option A:** the deviation lives as a template config feature, not a fork.
- **Sync discipline:** never patch a course copy directly; fix in template + `sync.sh`. Never run a bare `clasp deploy` in a course folder (mints a new URL, breaks Moodle link) — reuse `deployment-id.txt`.
- **Docs house style:** Calibri body, green headings, **no em/en-dashes**; generated with the `gasdoc` skill.
- **Ownership:** template + copies owned by `pcom_instructional_design@ncsu.edu`; append `?authuser=pcom_instructional_design@ncsu.edu` to editor links. Steps needing that login are marked **[pcom]**.

## File Structure

Template folder `~/Documents/Programming/PeerBonus-template`:
- `Code.js` — add `grading_mode`/`flag_threshold` config defaults, a pure `buildFlagOnlyRows_()` helper + Node export guard, split `generateGradebook()` into a shared prefix + `buildGradebook_bonusRatio_()` (existing logic, moved) + `buildGradebook_flagOnly_()` (new).
- `config.js` — add `gradingMode` / `flagThreshold` to `COURSE` (template defaults).
- `.claspignore` — exclude `test/**` from `clasp push`.
- `test/flagOnly.test.js` — new; Node assertions for `buildFlagOnlyRows_()`.
- `sync.sh` — register the MBA 590 course folder (Task 5).

New course folder `~/Documents/Programming/Haroon-Bonus-MBA590` (Task 3):
- Copy of template; per-course `config.js` sets `gradingMode: 'flag_only'`; own `.clasp.json`, `appsscript.json`, `deployment-id.txt`, `SETUP-NOTES.md`.

---

## Task 1: Template — config plumbing + pure flag-only row builder (Node-tested)

**Files:**
- Modify: `Code.js` — `getConfig()` defaults array (~line 94-100); add `buildFlagOnlyRows_()` and an export guard at end of file.
- Modify: `config.js` — add two `COURSE` fields.
- Modify: `.claspignore` — add `test/**`.
- Test: `test/flagOnly.test.js` (create).

**Interfaces:**
- Produces: `buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold)` → `{ rows: any[][], flags: boolean[] }`.
  - `sorted`: array of roster objects `{ firstName, lastName, email, section }` (already sorted).
  - `sectionSize`: `{ [section: string]: number }`.
  - `scoresReceived`: `{ [emailLowercase: string]: number[] }`.
  - `submitters`: `Set<string>` of lowercased reviewer emails.
  - `flagThreshold`: number (e.g. `0.75`).
  - Each `rows[i]` is 13 cells `[Team, Last, First, TeamSize, ReviewsRcvd, AvgBonus, EqualShare, ''(H), Submitted, Flag, 100(Grade), ''(Override), ''(Final)]`; `flags[i]` is that row's flagged boolean.
- Consumed by Task 2 (`buildGradebook_flagOnly_`).

- [ ] **Step 1: Write the failing test**

Create `test/flagOnly.test.js`:

```js
'use strict';
const assert = require('assert');
const { buildFlagOnlyRows_ } = require('../Code.js');

// Roster spanning every spec edge case.
// Team A size 3 -> equalShare 500; flag if avg < 375 (0.75 * 500).
// Team B size 1 -> solo, equalShare 0.
// Team C size 2 -> equalShare 1000; member received no reviews.
const sorted = [
  { firstName: 'Ann', lastName: 'Above', email: 'ann@x.edu', section: 'A' },
  { firstName: 'Ben', lastName: 'Below', email: 'ben@x.edu', section: 'A' },
  { firstName: 'Cy',  lastName: 'Cusp',  email: 'cy@x.edu',  section: 'A' },
  { firstName: 'Sol', lastName: 'Solo',  email: 'sol@x.edu', section: 'B' },
  { firstName: 'Dot', lastName: 'Dark',  email: 'dot@x.edu', section: 'C' },
];
const sectionSize = { A: 3, B: 1, C: 2 };
const scoresReceived = {
  'ann@x.edu': [600, 700], // avg 650, ratio 1.30 -> not flagged
  'ben@x.edu': [200, 300], // avg 250, ratio 0.50 -> FLAGGED
  'cy@x.edu':  [375, 375], // avg 375, ratio 0.75 -> NOT flagged (strict <)
  // sol: none. dot: none.
};
const submitters = new Set(['ann@x.edu']); // only Ann submitted

const { rows, flags } = buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, 0.75);

// Grade (col K, index 10) always 100.
rows.forEach((r, i) => assert.strictEqual(r[10], 100, 'row ' + i + ' grade must be 100'));

// Flag decisions.
assert.strictEqual(flags[0], false, 'Ann above -> not flagged');
assert.strictEqual(flags[1], true,  'Ben below 75% -> flagged');
assert.strictEqual(flags[2], false, 'Cy at exactly 0.75 -> not flagged (strict <)');
assert.strictEqual(flags[3], false, 'Solo team -> not flagged');
assert.strictEqual(flags[4], false, 'No reviews received -> not flagged');

// Non-submitters still 100; flag driven only by reviews received.
assert.strictEqual(rows[1][8], 'No', 'Ben did not submit (col I)');
assert.strictEqual(rows[1][9], '⚠ Below 75% of even split', 'Ben flag text (col J)');
assert.strictEqual(rows[4][9], '', 'Dot no-reviews -> blank flag');
assert.strictEqual(rows[0][8], 'Yes', 'Ann submitted (col I)');

// Diagnostics: Ben F=avg 250 (col F), G=equalShare 500 (col G).
assert.strictEqual(rows[1][5], 250, 'Ben avg bonus');
assert.strictEqual(rows[1][6], 500, 'Ben equal share');

console.log('flag-only row builder: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Programming/PeerBonus-template && node test/flagOnly.test.js`
Expected: FAIL — `TypeError: buildFlagOnlyRows_ is not a function` (not yet exported).

- [ ] **Step 3: Add the pure helper + export guard to `Code.js`**

Append near the other module-level helpers (e.g. just before `function generateGradebook`), the pure builder:

```js
// Pure, side-effect-free row builder for the flag-only grading mode.
// Kept free of SpreadsheetApp so it can be unit-tested under Node.
function buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold) {
  const pct = Math.round(flagThreshold * 100);
  const rows = [];
  const flags = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const email = (p.email || '').toLowerCase();
    const section = (p.section || 'Unknown').toString().trim();
    const teamSize = sectionSize[section] || 0;
    const scores = scoresReceived[email] || [];
    const reviewsCount = scores.length;
    const avgBonus = reviewsCount ? scores.reduce((a, b) => a + b, 0) / reviewsCount : 0;
    const equalShare = teamSize > 1 ? 1000 / (teamSize - 1) : 0;
    const bonusRatio = equalShare > 0 ? avgBonus / equalShare : 0;
    const flagged = reviewsCount > 0 && equalShare > 0 && bonusRatio < flagThreshold;
    const submitted = submitters.has(email) ? 'Yes' : 'No';
    rows.push([
      section, p.lastName, p.firstName, teamSize, // A-D
      reviewsCount,                               // E
      Math.round(avgBonus),                       // F
      Math.round(equalShare),                     // G
      '',                                         // H: ratio formula (set in builder)
      submitted,                                  // I
      flagged ? ('⚠ Below ' + pct + '% of even split') : '', // J: Flag
      100,                                        // K: Grade (A)
      '',                                         // L: Override
      ''                                          // M: Final Grade formula (set in builder)
    ]);
    flags.push(flagged);
  }
  return { rows: rows, flags: flags };
}
```

At the very end of `Code.js`, add the Node export guard (no-op inside GAS, where `module` is undefined):

```js
// Node-only: expose pure helpers for local unit tests. Harmless under GAS.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFlagOnlyRows_: buildFlagOnlyRows_ };
}
```

In `getConfig()`, extend the `defaults` array (currently ends with `['reflection_folder_id', '']`) to:

```js
  const defaults = [
    ['app_title',              '💵 ' + COURSE.label + ': Peer Evaluation'],
    ['app_subtitle',           COURSE.subtitle],
    ['intro_text',             'Please complete both parts of this evaluation before the deadline.'],
    ['admin_whitelist',        ''],
    ['reflection_folder_id',   ''],
    ['grading_mode',           COURSE.gradingMode || 'bonus_ratio'],
    ['flag_threshold',         (COURSE.flagThreshold != null ? COURSE.flagThreshold : 0.75)]
  ];
```

- [ ] **Step 4: Add the `COURSE` template defaults in `config.js`**

Inside the `COURSE` object (after `subtitle`, before `urls`), add:

```js
  // Grading scheme. 'bonus_ratio' (default) = continuous grade from peer $.
  // 'flag_only' = everyone gets 100 (A); students reviewed below
  // flagThreshold of the even split are flagged for the instructor.
  gradingMode:   'bonus_ratio',
  flagThreshold: 0.75,
```

- [ ] **Step 5: Exclude tests from `clasp push`**

Add to `.claspignore` (so the Node-only test file is never uploaded to GAS):

```
test/**
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd ~/Documents/Programming/PeerBonus-template && node test/flagOnly.test.js`
Expected: PASS — prints `flag-only row builder: all assertions passed`, exit code 0.

- [ ] **Step 7: Checkpoint**

No git repo here (clasp project). Instead, verify nothing else broke:
Run: `cd ~/Documents/Programming/PeerBonus-template && node -e "require('./Code.js'); console.log('Code.js loads clean')"`
Expected: prints `Code.js loads clean` (confirms no syntax/top-level errors introduced).

---

## Task 2: Template — dispatch `generateGradebook()` and add the flag-only builder

**Files:**
- Modify: `Code.js` — `generateGradebook()` (currently ~lines 433-642): keep the shared prefix, move the existing body into `buildGradebook_bonusRatio_()`, add `buildGradebook_flagOnly_()`, dispatch on mode, keep a shared tail.

**Interfaces:**
- Consumes: `getConfig(ss)` → `{ grading_mode, flag_threshold, ... }`; `buildFlagOnlyRows_(...)` from Task 1; `getRoster()`.
- Produces:
  - `buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters)` — existing behavior, unchanged output.
  - `buildGradebook_flagOnly_(gb, sorted, sectionSize, scoresReceived, submitters, flagThreshold)`.

- [ ] **Step 1: Rewrite `generateGradebook()` prefix + dispatch**

Replace the body of `generateGradebook(silent)` **from the line `let gb = ss.getSheetByName('Gradebook');` through the final `ui.alert(...)`** with the following. The code ABOVE that line (roster load, `sectionSize` counting, `Responses` read into `submitters`/`scoresReceived`) stays exactly as-is.

```js
  // ── Build or clear Gradebook sheet ────────────────────────────────────────
  let gb = ss.getSheetByName('Gradebook');
  if (gb) { gb.clear(); } else { gb = ss.insertSheet('Gradebook'); }

  // ── Sort roster (shared by both modes) ────────────────────────────────────
  const sorted = [...roster].sort((a, b) => {
    const ta = isNaN(a.section) ? a.section : Number(a.section);
    const tb = isNaN(b.section) ? b.section : Number(b.section);
    if (ta < tb) return -1; if (ta > tb) return 1;
    return a.lastName.localeCompare(b.lastName);
  });

  // ── Dispatch on grading mode ──────────────────────────────────────────────
  const config = getConfig(ss);
  const mode = (config.grading_mode || 'bonus_ratio').toString().trim();
  const flagThreshold = Number(config.flag_threshold) || 0.75;

  if (mode === 'flag_only') {
    buildGradebook_flagOnly_(gb, sorted, sectionSize, scoresReceived, submitters, flagThreshold);
  } else {
    buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters);
  }

  // ── Shared tail ───────────────────────────────────────────────────────────
  gb.setFrozenRows(1);
  const n = sorted.length;
  const noteRow = n + 3;
  gb.getRange(noteRow, 1, 1, 4).merge()
    .setValue(`Generated: ${new Date().toLocaleString()}  |  ${n} students  |  ${submitters.size} submitted`)
    .setFontColor('#888888').setFontStyle('italic').setFontSize(9);

  if (!silent) ss.setActiveSheet(gb);
  if (ui && !silent) ui.alert(`Gradebook generated — ${n} students, ${submitters.size} submitted (mode: ${mode}).`);
```

- [ ] **Step 2: Extract the existing logic into `buildGradebook_bonusRatio_()`**

Create a new function `buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters)`. Move into its body the **existing** code that previously lived in `generateGradebook` from the `const headers = [...]` block through the alternating-row `setBackgrounds` block (original lines ~479-632), with exactly two deltas:

1. **Delete** the internal sort block (original lines ~521-527, `const sorted = [...roster].sort(...)`) — `sorted` is now a parameter.
2. Nothing else changes: it already reads `sectionSize`, `scoresReceived`, `submitters`, which are now parameters.

Do NOT move `gb.setFrozenRows(1)`, the note-row block, `ss.setActiveSheet`, or the `ui.alert` — those now live in the shared tail (Step 1).

Function shape:

```js
function buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters) {
  // ── Headers ── (original headers block, unchanged)
  const headers = [
    'Team', 'Last Name', 'First Name', 'Team Size',
    'Reviews Received', 'Avg Bonus Received ($)', 'Equal Share ($)', 'Bonus Ratio (F ÷ G)',
    'Submitted', 'Grade',
    'Override', 'Final Grade'
  ];
  gb.appendRow(headers);
  // ...(rest of the original header styling, header notes, output-row build,
  //     H/J/L formulas, formatting, and alternating backgrounds — MOVED
  //     verbatim from the old generateGradebook, minus the internal sort)...
}
```

- [ ] **Step 3: Add `buildGradebook_flagOnly_()`**

```js
function buildGradebook_flagOnly_(gb, sorted, sectionSize, scoresReceived, submitters, flagThreshold) {
  const pct = Math.round(flagThreshold * 100);

  // ── Headers: A..M ──
  const headers = [
    'Team', 'Last Name', 'First Name', 'Team Size',
    'Reviews Received', 'Avg Bonus Received ($)', 'Equal Share ($)', 'Bonus Ratio (F ÷ G)',
    'Submitted', 'Flag', 'Grade', 'Override', 'Final Grade'
  ];
  gb.appendRow(headers);
  gb.getRange(1, 1, 1, headers.length)
    .setBackground('#cc0000').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  gb.getRange(1, 10).setNote(
    'Flag = "⚠ Below ' + pct + '% of even split" when a student was reviewed and\n' +
    'valued below ' + pct + '% of the even split (Bonus Ratio < ' + flagThreshold + ').\n\n' +
    'A flag is a "look here", NOT a penalty. Every student still earns 100 (A).\n' +
    'Non-submitters and students who received no reviews are never flagged.\n' +
    'To lower a flagged student, type a number in Override (col L).'
  );
  gb.getRange(1, 13).setNote(
    'Final Grade = IF(Override<>"", Override, 100).\n\n' +
    'Everyone earns 100 (A). Not submitting a review never lowers the grade.\n' +
    'The only signal is the Flag (col J); acting on it is the instructor\'s call\n' +
    'via Override (col L).'
  );

  // ── Rows (pure builder from Task 1) ──
  const built = buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold);
  const outputRows = built.rows;
  const flags = built.flags;
  const n = outputRows.length;
  if (n > 0) gb.getRange(2, 1, n, 13).setValues(outputRows);

  // ── Formulas: H (ratio display), M (final grade) ──
  if (n > 0) {
    gb.getRange(2, 8, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => ['=IFERROR(F' + (i + 2) + '/G' + (i + 2) + ', 0)'])
    );
    gb.getRange(2, 13, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => ['=IF(L' + (i + 2) + '<>"", L' + (i + 2) + ', K' + (i + 2) + ')'])
    );
  }

  // ── Column widths ──
  gb.setColumnWidth(1, 70);  gb.setColumnWidth(2, 130); gb.setColumnWidth(3, 120);
  gb.setColumnWidth(4, 80);  gb.setColumnWidth(5, 110); gb.setColumnWidth(6, 150);
  gb.setColumnWidth(7, 110); gb.setColumnWidth(8, 100); gb.setColumnWidth(9, 90);
  gb.setColumnWidth(10, 210); gb.setColumnWidth(11, 70); gb.setColumnWidth(12, 130);
  gb.setColumnWidth(13, 100);

  if (n > 0) {
    // Submitted (I=9): informational green/red.
    const submittedRange = gb.getRange(2, 9, n, 1);
    submittedRange.setHorizontalAlignment('center').setFontWeight('bold');
    submittedRange.setBackgrounds(outputRows.map(r => [r[8] === 'Yes' ? '#d4edda' : '#f8d7da']));
    submittedRange.setFontColors(outputRows.map(r => [r[8] === 'Yes' ? '#155724' : '#721c24']));

    // Flag (J=10): red fill on flagged rows only.
    const flagRange = gb.getRange(2, 10, n, 1);
    flagRange.setFontWeight('bold');
    flagRange.setBackgrounds(flags.map(f => [f ? '#f8d7da' : '#ffffff']));
    flagRange.setFontColors(flags.map(f => [f ? '#721c24' : '#000000']));

    // Numeric band + formats.
    gb.getRange(2, 4, n, 5).setHorizontalAlignment('center'); // D..H
    gb.getRange(2, 6, n, 1).setNumberFormat('$#,##0');        // F
    gb.getRange(2, 7, n, 1).setNumberFormat('$#,##0');        // G
    gb.getRange(2, 8, n, 1).setNumberFormat('0.00');          // H
    gb.getRange(2, 11, n, 1).setHorizontalAlignment('center'); // K Grade
    gb.getRange(2, 12, n, 1).setBackground('#fffbe6');         // L Override
    gb.getRange(2, 13, n, 1).setFontWeight('bold').setHorizontalAlignment('center'); // M Final

    // Alternating row backgrounds A..D.
    const altBgs = outputRows.map((_, i) => {
      const c = (i % 2 === 1) ? '#f8f8f8' : '#ffffff';
      return [c, c, c, c];
    });
    gb.getRange(2, 1, n, 4).setBackgrounds(altBgs);
  }
}
```

- [ ] **Step 4: Static checks (local)**

Run: `cd ~/Documents/Programming/PeerBonus-template && node -e "require('./Code.js'); console.log('ok')" && node test/flagOnly.test.js`
Expected: prints `ok`, then `flag-only row builder: all assertions passed` (Task 1 regression still green — `buildFlagOnlyRows_` unchanged).

- [ ] **Step 5: In-sheet behavioral verification** — **[pcom]** (Elizabeth, in the template's own throwaway check or a scratch copy — do NOT run Set Up on the pristine template sheet)

Because `generateGradebook` needs `SpreadsheetApp`, behavior is verified in Sheets, not Node. On a scratch copy or the MBA 590 copy once it exists (Task 3):

1. `clasp push --force`.
2. Peer Eval Admin menu → **🧪 Generate Test Data**, then **📊 Generate Gradebook**.
3. With `grading_mode = flag_only`: confirm columns are `… Submitted | Flag | Grade | Override | Final Grade`; every **Final Grade = 100** except any manual Override; only rows with reviews AND ratio < 0.75 show the red **⚠ Below 75% of even split**; a non-submitter shows `Submitted = No` yet Final Grade = 100; a zero-reviews student is un-flagged at 100.
4. Regression: temporarily set Config `grading_mode = bonus_ratio`, regenerate, confirm the old 12-column layout returns and a non-submitter shows Final Grade = 0. Restore `flag_only`.

Expected: all four checks pass. Record the result in the course `SETUP-NOTES.md`.

---

## Task 3: Stand up the `Haroon-Bonus-MBA590` course copy

**Files:**
- Create: folder `~/Documents/Programming/Haroon-Bonus-MBA590` (copy of template) with its own `config.js`, `.clasp.json`, `appsscript.json`, `deployment-id.txt`, `SETUP-NOTES.md`.

**Prerequisite inputs (collect before starting; pause and ask Elizabeth if missing):**
- `COURSE.label` (e.g. `MBA 590 (601) Fall 2026`), `COURSE.subtitle` (course topic).
- Haroon's email (for `admin_whitelist`).
- Real roster (First, Last, Email, Team) — or agreement to proceed on Testdata until it arrives.

- [ ] **Step 1: Copy the template and drop template-only files**

```bash
cd ~/Documents/Programming
cp -R PeerBonus-template Haroon-Bonus-MBA590
cd Haroon-Bonus-MBA590
rm -f .clasp.json README.md sync.sh deployment-id.txt
rm -rf docs test
```

- [ ] **Step 2: Create the GAS project (fresh sheet)**

Run: `cd ~/Documents/Programming/Haroon-Bonus-MBA590 && clasp create --type sheets --title "MBA 590 Peer Evaluation"`
Expected: writes a new `.clasp.json` with a fresh `scriptId`, and creates a bound spreadsheet. Note both IDs.

- [ ] **Step 3: Restore the real manifest**

`clasp create` overwrites `appsscript.json` with a bare manifest, dropping the `webapp` block and oauth scopes. Restore it:

```bash
cp ~/Documents/Programming/PeerBonus-template/appsscript.json ~/Documents/Programming/Haroon-Bonus-MBA590/appsscript.json
```

- [ ] **Step 4: Set the per-course `config.js`**

Edit `~/Documents/Programming/Haroon-Bonus-MBA590/config.js` — set `label` and `subtitle` to the collected values and set the grading mode:

```js
const COURSE = {
  label: 'MBA 590 (…) …',        // <- collected value
  subtitle: '…',                  // <- collected value
  gradingMode:   'flag_only',
  flagThreshold: 0.75,
  urls: {
    form: '[WEB_APP_EXEC_URL]', sheet: '[SPREADSHEET_URL]',
    reflections: '[REFLECTIONS_FOLDER_URL]', summary: '[SUMMARY_FOLDER_URL]',
    mainGuide: '[FULL_INSTRUCTOR_GUIDE_DOC_URL]'
  }
};
```

- [ ] **Step 5: Push**

Run: `cd ~/Documents/Programming/Haroon-Bonus-MBA590 && clasp push --force`
Expected: uploads `Code.js`, `Index.html`, `Instructions.html`, `QuickGuides.js`, `config.js`, `appsscript.json` (test/ and docs/ removed/ignored). No errors.

- [ ] **Step 6: First-run setup in Sheets** — **[pcom]** (Elizabeth)

Open the new sheet with `?authuser=pcom_instructional_design@ncsu.edu`. Peer Eval Admin menu →
1. **🚀 Set Up Sheet (first run)** (authorize when prompted).
2. **📁 Set Up Output Folders** (creates this course's Summaries/Reflections folders, writes their IDs to Config).
3. Confirm the Config tab shows `grading_mode = flag_only` and `flag_threshold = 0.75`.

- [ ] **Step 7: Roster + whitelist** — **[pcom]** (Elizabeth)

1. Paste the MBA 590 roster into the Roster tab (First, Last, Email, Team); keep the Testdata team.
2. Config tab → `admin_whitelist` = Haroon's email + `leshamb2@ncsu.edu` + `pcom_instructional_design@ncsu.edu`.

- [ ] **Step 8: Deploy the web app and save the deployment id**

```bash
cd ~/Documents/Programming/Haroon-Bonus-MBA590
clasp deploy --description "initial deployment"
# copy the deployment id from the output:
echo "<DEPLOYMENT_ID>" > deployment-id.txt
```

Moodle web-app URL: `https://script.google.com/a/macros/ncsu.edu/s/<DEPLOYMENT_ID>/exec`

- [ ] **Step 9: Verify the deviation live** — **[pcom]** (Elizabeth)

Run the Task 2 Step 5 in-sheet checklist on this copy (Generate Test Data → Generate Gradebook, confirm flag-only behavior). Record pass/fail in `SETUP-NOTES.md`.

---

## Task 4: Instructor docs (QuickGuides + guide) for the flag-only scheme

**Files:**
- Modify: `Haroon-Bonus-MBA590/config.js` — fill `COURSE.urls` from the deployed values.
- Create: generated QuickGuides doc (via `createQuickGuides()`), and an instructor guide via the `gasdoc` skill.

- [ ] **Step 1: Fill `COURSE.urls` and push**

Edit `Haroon-Bonus-MBA590/config.js` `urls`: `form` = exec URL (Task 3 Step 8), `sheet` = spreadsheet URL, `reflections`/`summary` = the two folder URLs from Config (Task 3 Step 6), `mainGuide` = placeholder until Step 3 produces it.
Run: `cd ~/Documents/Programming/Haroon-Bonus-MBA590 && clasp push --force`

- [ ] **Step 2: Generate QuickGuides** — **[pcom]** (Elizabeth)

In the editor (`?authuser=pcom…`), run `createQuickGuides()`. Confirm the generated Google Doc opens and links resolve.

- [ ] **Step 3: Write the instructor guide (flag-only wording)**

Invoke the `gasdoc` skill to produce the MBA 590 instructor guide. It MUST describe the flag-only scheme, not bonus-ratio: everyone earns an A (100); the **⚠ Below 75% of even split** flag marks students whose peers valued them under 75% of the even split; **not submitting a review is never penalized**; students who received no reviews are not flagged; use the **Override** column to adjust a flagged student. House style (Calibri, green headings, no em/en-dashes).

- [ ] **Step 4: Link the guide back**

Put the guide's Doc URL into `COURSE.urls.mainGuide`, then `clasp push --force`. Share the guide with Haroon (and re-run `createQuickGuides()` if it embeds the guide link).

---

## Task 5: Register the course and (optionally) propagate the template change

**Files:**
- Modify: `PeerBonus-template/sync.sh` — add the new folder to `COURSES`.
- Create: `Haroon-Bonus-MBA590/SETUP-NOTES.md` — record IDs/URLs.

- [ ] **Step 1: Register in `sync.sh`**

Add `Haroon-Bonus-MBA590` to the `COURSES` array in `PeerBonus-template/sync.sh` so future template fixes reach it.

- [ ] **Step 2: Record setup notes**

Create `Haroon-Bonus-MBA590/SETUP-NOTES.md` with: script ID, spreadsheet ID + URL, deployment ID + exec URL, Summaries/Reflections folder IDs, `admin_whitelist`, grading mode (`flag_only`, threshold 0.75), instructor guide URL, and the Task 2/3 verification results.

- [ ] **Step 3: (Optional) propagate the template change to existing courses**

The template edit is behavior-preserving under the default mode. When Elizabeth is ready:
Run: `cd ~/Documents/Programming/PeerBonus-template && ./sync.sh --push --deploy` (answers per course).
Expected: existing courses gain a `grading_mode`/`flag_threshold` Config row (value `bonus_ratio`) with no output change. This does NOT block MBA 590 and can be deferred.

---

## Self-Review

**Spec coverage:**
- Non-punitive non-submitters → Task 1 helper (`Submitted` informational) + Task 2 tail (no `IF(Submitted="No",0)`); verified Task 2 Step 5.3. ✓
- Good/balanced → A(100); only poor (<0.75) flagged → Task 1 helper + test; Task 3 builder. ✓
- No-reviews / solo un-flagged → Task 1 test cases (Sol, Dot). ✓
- Config-driven mode, existing courses unchanged → Task 1 defaults (append-only), Task 2 dispatcher + `buildGradebook_bonusRatio_` verbatim move; Task 2 Step 5.4 regression. ✓
- Gradebook layout A–M → Task 2 Step 3. ✓
- Course copy spin-up → Task 3. ✓
- Docs rewritten for flag-only → Task 4. ✓
- sync.sh registration + backward-compatible propagation → Task 5. ✓

**Placeholder scan:** Bracketed values (`MBA 590 (…)`, `<DEPLOYMENT_ID>`, URL placeholders) are genuine runtime inputs gathered in Task 3/4, not design gaps; the plan says where each is filled. No TBD logic remains.

**Type consistency:** `buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold)` signature and its 13-cell row shape are identical in Task 1 (defn + test), Task 2 (caller `buildGradebook_flagOnly_`). Column map (Flag=J/10, Grade=K/11, Override=L/12, Final=M/13) consistent across spec, Task 2 headers, formulas, and formatting.
