# Haroon MBA 590 Peer Bonus — Flag-Only (Non-Punitive) Grading

- **Date:** 2026-07-22
- **Status:** Approved design, pending spec review
- **Author:** Elizabeth (via Claude)
- **Applies to:** the shared PeerBonus template + a new course copy `Haroon-Bonus-MBA590`

## Context

The dollar-allocation peer-bonus app (this template) has students distribute
$1,000 among teammates. Today's gradebook converts that into a **continuous**
grade: `Grade = MIN(100, BonusRatio × 100)`, where
`BonusRatio = AvgBonusReceived ÷ EqualShare` and `EqualShare = $1,000 ÷ (teamSize − 1)`.
Two consequences of the current scheme are exactly what Haroon (MBA 590) does
**not** want:

1. Non-submitters are forced to **0** (`Final Grade = IF(Submitted="No", 0, …)`).
2. Any student valued **below** the even split lands **below 100**, even if only
   slightly below average.

## Goal

A **non-punitive** scheme for MBA 590:

- Not submitting a review **never** lowers a student's grade.
- **Good or balanced** peer reviews → an **A (= 100)**.
- The **only** thing that can single a student out is receiving **poor** reviews,
  defined as being valued at **under 75% of the even split**. Those students are
  **flagged** for the instructor — they still receive the A automatically; the
  flag is a "look here," not an automatic penalty.

## Non-goals

- No change to the student-facing app (still the $1,000 dollar-allocation input,
  same reflections, same validation).
- No change to any existing course's grading behavior.
- No automatic grade reduction. Lowering a flagged student's grade is a manual
  instructor decision via the existing Override column.

## Design

### Grade logic (`flag_only` mode)

For each student, compute the same diagnostics as today:

- `reviewsCount` = number of peers who actually reviewed them
- `avgBonus` = mean dollars received across those reviewers (0 if none)
- `equalShare = $1,000 ÷ (teamSize − 1)` (0 for a one-person team)
- `bonusRatio = avgBonus ÷ equalShare` (0 when `equalShare` is 0 or no reviews)

Then:

- **Grade = 100 (A) for every student.**
- **Flag** = `⚠ Below 75% of even split` **iff** `reviewsCount > 0` **and**
  `bonusRatio < flag_threshold` (default `0.75`). Otherwise blank. The flagged
  cell/row is shaded red.
- **Final Grade** = `IF(Override set, Override, 100)`.

### Edge cases (all resolve to an un-flagged A)

| Situation | Flagged? | Grade |
|---|---|---|
| Valued at/above even split (ratio ≥ 0.75) | No | 100 |
| Valued under 75% of even split (ratio < 0.75) | **Yes** | 100 (Override to adjust) |
| Received **no** reviews (all teammates skipped) | No — no data, benefit of the doubt | 100 |
| **Did not submit** their own review | No — submission is informational only | 100 |
| One-person team (`equalShare = 0`) | No | 100 |

`Submitted` (Yes/No) is retained as an **informational** column only; it no
longer affects Grade or Flag. The flag is driven purely by reviews **received**,
so a non-submitter who was rated poorly by peers is still flagged (but still an A).

### Gradebook layout (`flag_only` mode)

Columns A–I are unchanged from today so the instructor can see *why* a row is
flagged. The old formula-driven `Grade` becomes a flat 100, and a new **Flag**
column is inserted:

```
A Team           B Last Name       C First Name     D Team Size
E Reviews Rcvd   F Avg Bonus ($)   G Equal Share($) H Bonus Ratio (F÷G)
I Submitted (info only)
J Flag           ← "⚠ Below 75% of even split" when H<0.75 and E>0; red fill
K Grade          ← 100 for all
L Override       ← manual, yellow
M Final Grade    ← =IF(L<>"", L, K)
```

Flag text and shading are computed in Apps Script from the JS-side `avgBonus`
and `equalShare` (same inputs as column H) and written with the row values, the
way the existing `Submitted` colors are batched — no spreadsheet conditional
formatting needed. Column H remains a display formula (`=IFERROR(F/G,0)`).

## Architecture — config-driven mode in the template (Option A)

Per the template's own README policy ("re-implement their specific tweaks as
config/template features"), the deviation is a **selectable grading mode in the
shared `Code.js`**, not a fork. Default preserves today's behavior for every
existing course.

**Files touched in the template:**

1. **`config.js`** — add two `COURSE` fields with the template defaults:
   ```js
   gradingMode:   'bonus_ratio',  // 'bonus_ratio' (default) | 'flag_only'
   flagThreshold: 0.75,           // used only by 'flag_only'
   ```
2. **`Code.js` — `getConfig()` defaults** (the `defaults` array): append
   ```js
   ['grading_mode',   COURSE.gradingMode   || 'bonus_ratio'],
   ['flag_threshold', COURSE.flagThreshold != null ? COURSE.flagThreshold : 0.75],
   ```
   Because `getConfig` appends only genuinely-missing keys, existing running
   courses get `grading_mode = 'bonus_ratio'` added on next read → **no behavior
   change**.
3. **`Code.js` — `generateGradebook()`** — read `grading_mode` /
   `flag_threshold` via `getConfig(ss)` and branch:
   - `'bonus_ratio'` → today's columns/formulas, **byte-for-byte unchanged**.
   - `'flag_only'` → the layout and logic above.
   Extract each branch into a small helper (`buildGradebook_bonusRatio_`,
   `buildGradebook_flagOnly_`) so each is independently readable/testable and the
   dispatcher stays tiny.

**Haroon's course copy** then only sets, in its own `config.js`:
```js
gradingMode:   'flag_only',
flagThreshold: 0.75,
```
Because MBA 590 gets a **fresh sheet**, its Config tab is created with
`grading_mode = flag_only` from first run (avoids the inherited-config gotcha).

### Backward compatibility & rollout to existing courses

The template change is behavior-preserving under the default mode, so
`./sync.sh --push --deploy` can propagate it to registered courses safely. The
sole visible effect on an existing course is a new `grading_mode` /
`flag_threshold` row appearing in its Config tab (value `bonus_ratio`). Syncing
existing courses is optional and can be deferred; MBA 590 does not depend on it.

## Docs deliverable

- `createQuickGuides()` output + instructor guide, rewritten for MBA 590 to
  describe the **flag-only** scheme: what the ⚠ flag means, that non-submission
  and no-reviews-received are **not** penalized, and how to use the Override
  column to adjust a flagged student. Drop the bonus-ratio-as-grade explanation.
- Use the `gasdoc` skill for the instructor guide, in Elizabeth's house style.

## Course setup (new copy `Haroon-Bonus-MBA590`)

Standard template recipe (README) with the config tweak folded in. Steps that
require Elizabeth in the browser as `pcom_instructional_design@ncsu.edu` are
marked **[pcom]**.

1. `cp -R PeerBonus-template Haroon-Bonus-MBA590`; `rm .clasp.json README.md sync.sh`.
2. `clasp create --type sheets --title "MBA 590 Peer Evaluation"`.
3. Restore `appsscript.json` from the template (clasp overwrites it).
4. Edit `config.js`: `label`, `subtitle`, **`gradingMode: 'flag_only'`,
   `flagThreshold: 0.75`**.
5. `clasp push --force`.
6. **[pcom]** Open the new sheet → **🚀 Set Up Sheet** → **📁 Set Up Output
   Folders** (authorize when prompted).
7. **[pcom]** Paste the real MBA 590 roster (First, Last, Email, Team); keep the
   Testdata team.
8. **[pcom]** Config tab: set `admin_whitelist` (Haroon + leshamb2 + pcom).
   Confirm `grading_mode = flag_only`.
9. Deploy: `clasp deploy --description "initial deployment"`;
   `echo "<ID>" > deployment-id.txt`. Moodle URL:
   `https://script.google.com/a/macros/ncsu.edu/s/<ID>/exec`.
10. Fill `COURSE.urls` in `config.js`; `clasp push --force`; run
    `createQuickGuides()`; share with Haroon (gasdoc for the full guide).
11. Register the folder in the template `sync.sh` `COURSES` list; write
    `SETUP-NOTES.md` with IDs/URLs.

## Inputs still needed from Elizabeth

- MBA 590 course **subtitle** (the topic line under the app title).
- Haroon's **email** (for `admin_whitelist`) and preferred **app label**
  (e.g. `MBA 590 (…) Fall 2026`).
- The real **roster** (or confirmation to proceed with Testdata only until the
  roster is ready).
- Whether to `--push --deploy` the template change to existing courses now or
  later (does not block MBA 590).

## Verification

- **Template regression:** with `grading_mode = bonus_ratio`, generated
  gradebook is identical to pre-change (same columns, same formulas, non-submitter
  → 0). Verify on the Testdata team.
- **New mode:** with `grading_mode = flag_only`, using generated test data,
  confirm: every Final Grade = 100 except manual Overrides; only rows with
  `reviewsCount > 0` and `ratio < 0.75` carry the ⚠ flag and red fill; a
  non-submitter shows `Submitted = No` yet Final Grade = 100; a student with zero
  reviews received is un-flagged at 100.

## Open questions

None outstanding. A = 100, flag threshold = 0.75 (< 75% of even split), Option A
architecture — all confirmed.
