# Peer Bonus App — TEMPLATE

Master template for the dollar-allocation peer evaluation ("peer bonus") app.
Created 2026-07-12 from **Patrice-Bonus-462-601-SummerI** (the newest, tightened
dollar version). All course branding lives in **config.js** — the shared code
files are identical across every course copy, which is what makes sync work.

## Template IDs
- **Script ID:** `1ACmHPLWz5XWcpCg3aEixvzwdx-7_Mjdmfw7zYnaME-DtDaViW39tUwT9`
- **Spreadsheet ID:** `1g_oucKv47QlUPSoHDQiiqio6KIp8aI1az8DdYKihzZA`
- Sheet: https://docs.google.com/spreadsheets/d/1g_oucKv47QlUPSoHDQiiqio6KIp8aI1az8DdYKihzZA/edit
- Editor: https://script.google.com/d/1ACmHPLWz5XWcpCg3aEixvzwdx-7_Mjdmfw7zYnaME-DtDaViW39tUwT9/edit?authuser=pcom_instructional_design@ncsu.edu

Owned by `pcom_instructional_design@ncsu.edu` (clasp is logged in as pcom).
Always append `?authuser=pcom_instructional_design@ncsu.edu` to editor links
(multi-login 404 bug).

**Keep the template sheet pristine** — don't run Set Up Sheet or paste rosters
here. Each course copy gets a fresh sheet, so a fresh copy pulls its Config
straight from the code defaults. That avoids the inherited-config gotcha that
bit the Spain → Summer I duplication (old `app_title` and Drive folder IDs
surviving in the copied Config tab).

## File layout
- **Shared code** (synced by sync.sh, identical everywhere):
  `Code.js`, `Index.html`, `Instructions.html`, `QuickGuides.js`
- **Per-course** (never synced):
  `config.js` (course label/subtitle + QuickGuide URLs), `.clasp.json`,
  `deployment-id.txt`, `appsscript.json`, `SETUP-NOTES.md`

## How to spin up a new course copy

1. Copy this folder and start a fresh GAS project (fresh sheet = clean Config):
   ```bash
   cp -R ~/Documents/Programming/PeerBonus-template ~/Documents/Programming/<Instructor>-Bonus-<Course>
   cd ~/Documents/Programming/<Instructor>-Bonus-<Course>
   rm .clasp.json README.md sync.sh
   clasp create --type sheets --title "<Course> Peer Evaluation"
   ```
2. **Restore appsscript.json** — `clasp create` overwrites it with a bare
   default manifest, dropping the `webapp` block (`executeAs: USER_DEPLOYING`,
   `access: DOMAIN`) and oauthScopes. Re-copy it from this template folder.
3. Edit **config.js**: set `COURSE.label` (e.g. `'BUS 462 (601) Summer II'`)
   and `COURSE.subtitle` (e.g. `'Business Strategy'`). Leave `COURSE.urls`
   placeholders for now.
4. `clasp push --force`
5. Have Elizabeth open the new sheet as pcom → **Peer Eval Admin** menu →
   **🚀 Set Up Sheet (first run)** (authorize when prompted) →
   **📁 Set Up Output Folders** (creates this course's own Summaries/Reflections
   folders and writes their IDs into Config).
6. Paste the real roster into the Roster tab (First Name, Last Name, Email,
   Team) — keep the Testdata team for admin demos.
7. Config tab: set `admin_whitelist` (instructor + leshamb2 + pcom).
8. Deploy the web app and save the deployment ID (sync.sh --deploy reads it):
   ```bash
   clasp deploy --description "initial deployment"
   echo "<DEPLOYMENT_ID>" > deployment-id.txt
   ```
   Web app URL for Moodle:
   `https://script.google.com/a/macros/ncsu.edu/s/<DEPLOYMENT_ID>/exec`
9. Fill in `COURSE.urls` in config.js (exec URL, sheet URL, the two folder
   URLs from Config, instructor guide doc), `clasp push --force`, then run
   `createQuickGuides()` from the editor and share the generated doc with the
   instructor (or use the gasdoc skill for the full instructor guide).
10. **Register the course in sync.sh** — add its folder to `COURSES`. Record
    IDs/URLs in a SETUP-NOTES.md in the course folder.

## Bug fixes and improvements — the sync discipline

**Never patch a course copy directly.** Fix it HERE in the template, then:
```bash
./sync.sh                  # copy shared files into every registered course
./sync.sh --push           # …and clasp push each one
./sync.sh --push --deploy  # …and update each live web app (asks per course)
```
Redeploys reuse each course's `deployment-id.txt`, so Moodle links never
change. Never run a bare `clasp deploy` in a course folder — that mints a new
URL and breaks the Moodle link.

## Freeze-and-migrate policy (legacy apps)

The pre-template bonus apps — **Eda-MBA540-Bonus**, **DonW-Bonus-MBA544-001/601**,
and the **Patrice-Bonus-*** folders — are earlier generations of this app
(Eda's ≈ 300-line ancestor → Don's → Patrice's). Their code is too different
to reconcile with the template (diffs exceed the file sizes).

- **Freeze:** leave them as-is. If a bug surfaces in one, patch that one in
  place. Never add them to sync.sh.
- **Migrate:** when a legacy instructor runs the course again, do NOT reuse
  their old app — spin up a fresh copy from this template (recipe above) and
  re-implement their specific tweaks as config/template features. Data is
  per-semester, so nothing is lost.
- **Harvest:** before migrating an instructor, skim their old fork for tweaks
  worth absorbing into the template for everyone.

## Behavior notes
- **Blank team cells are "no team", never a team.** A student on the roster
  whose Team cell is empty gets a "No Team Assignment — contact your
  instructor" screen, and `submitPeerEval` rejects their submission. Before
  this, `p.section === currentUser.section` matched blank to blank, so every
  unassigned student silently formed a phantom team, evaluated each other, and
  wrote real bonus dollars into Responses. An admin with a blank team gets the
  Testdata demo instead (registrar rosters routinely list the instructor).
  Logic lives in `resolveRosterView_` and is unit-tested in `test/noTeam.test.js`.
- Admin view: whitelisted admins who are NOT on the roster see only the
  **Testdata** team (demo mode), not the full class — carried over from the
  Summer I version (Code.js, `isTestTeam_` filter in `doGet`). Change the
  filter back to `fullRoster` if an instructor wants to preview the whole
  class in-app.
- `reflection_folder_id` default is intentionally blank; **📁 Set Up Output
  Folders** fills it. Never hardcode a folder ID in the template.
- The Config sheet overrides config.js defaults at runtime (`app_title`,
  `app_subtitle`), which is why config.js must be filled in BEFORE the sheet's
  Config tab is first created.
- Denominations are US bills `[10, 20, 50, 100]`, $1,000 budget (dollar
  version — the euro/Spain variant is a legacy fork).
