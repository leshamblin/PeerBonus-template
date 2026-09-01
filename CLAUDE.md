# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`README.md` is the reference. This is the short version: the rules that, if
broken, cost a redeploy or break a live Moodle link.

## What this is

Master template for the dollar-allocation peer evaluation ("peer bonus") app,
Google Apps Script bound to a Sheet. Created 2026-07-12 from
`Patrice-Bonus-462-601-SummerI`.

- **Shared** (synced, identical everywhere): `Code.js`, `Index.html`,
  `Instructions.html`, `QuickGuides.js`
- **Per-course** (never synced): `config.js`, `.clasp.json`,
  `deployment-id.txt`, `appsscript.json`, `SETUP-NOTES.md`

## The sync discipline

**Never patch a course copy directly.** Fix it here, then:

```bash
./sync.sh                  # copy shared files into every registered course
./sync.sh --push           # …and clasp push each one
./sync.sh --push --deploy  # …and update each live web app (asks per course)
```

`sync.sh` overwrites shared files in course folders, so an edit made there is
silently reverted on the next sync and never reaches the other courses.

**Never run a bare `clasp deploy` in a course folder.** It mints a new URL and
breaks the Moodle link. Redeploys reuse `deployment-id.txt`.

A new course must be added to `COURSES` in `sync.sh` or it silently stops
receiving fixes.

## Keep the template sheet pristine

Do **not** run Set Up Sheet or paste a roster into the template's own
spreadsheet. Each course copy gets a fresh sheet, so a clean template means a
fresh copy pulls its Config straight from the code defaults.

This is not housekeeping — it is the fix for a real bug. The Spain → Summer I
duplication inherited a stale `app_title` and stale Drive folder IDs that
survived in the copied Config tab, because the source sheet had been used.

## Legacy apps: freeze, don't reconcile

The pre-template bonus apps — `Eda-MBA540-Bonus`, `DonW-Bonus-MBA544-*`, and the
`Patrice-Bonus-*` folders — are earlier generations of this app (Eda's ~300-line
ancestor → Don's → Patrice's). Their diffs exceed the file sizes, so they cannot
be reconciled with the template.

- **Freeze:** leave them as-is. Patch a bug in place, in that one copy.
  **Never add them to `sync.sh`.**
- **Migrate:** when a legacy instructor runs the course again, spin up a fresh
  copy from this template rather than reusing their old app. Data is
  per-semester, so nothing is lost.
- **Harvest:** before migrating someone, skim their fork for tweaks worth
  absorbing into the template for everyone.

## Repo scope

Private, and it must stay private: `README.md` carries the template's real
Script ID and Spreadsheet ID. Those are the template's own pristine sheet and
project — no student data behind them — but they are live pcom-owned resources.

Holds **no student data**: no rosters, no exports, no real addresses. Course
copies hold those. Before pushing, scan all history rather than the working
tree:

```bash
git grep -hoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' $(git rev-list --all) -- | sort -u
git grep -hoE 'https://(docs|script|drive)\.google\.com/[^ ")`]+' $(git rev-list --all) -- | sort -u
git ls-files | grep -iE '\.(docx|xlsx|pptx|pdf|zip)$'
```

A commit keeps its own snapshot, so fixing a file today leaves the old value
readable in the commit that introduced it. Expect only the two README IDs above
and synthetic fixtures (`alice.test@`, `prof@`, `ann@x.edu`). The third check
matters because an instructor guide `.docx` embeds live links no text grep finds.

Editor links need `?authuser=pcom_instructional_design@ncsu.edu` appended
(multi-login 404 bug). `clasp` is unaffected — it runs as pcom.
