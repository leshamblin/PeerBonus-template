# SDD Progress — Haroon MBA 590 Flag-Only Grading

Plan: `docs/superpowers/plans/2026-07-22-haroon-mba590-flag-only-grading.md`

**No git repo** (clasp project). Adaptations:
- "Commits" are replaced by local `node` checkpoints (per the plan).
- Reviewer diffs are generated with `diff -u` against snapshots in
  `<scratchpad>/sdd/orig/` (Code.js, config.js, .claspignore captured before Task 1).
- Isolation is snapshot-based (no worktree). Revert = restore from `sdd/orig/`.

## Task status
- Task 1 (template: config plumbing + pure builder + node test): COMPLETE (review clean)
- Task 2 (template: dispatch generateGradebook + flag-only builder): COMPLETE (review clean)
- Task 3 (stand up Haroon-Bonus-MBA590 copy): DEPLOYED. Script/Spreadsheet/Deployment IDs in the folder's SETUP-NOTES.md. appsscript.json restored; config.js has flag_only + form/sheet/reflections/summary URLs (mainGuide + label/subtitle still placeholders). deployment-id.txt corrected (was left as literal <DEPLOYMENT_ID>). Roster = Testdata-only. REMAINING [pcom]: final `clasp push --force` (for config.js URLs), step-7 gradebook verify, and eventually real label/subtitle + roster.
- Task 4 (docs): instructor guide REBUILT with all live links (MBA590-PeerEval-Instructor-Guide.docx, 0 em/en-dashes, real exec/sheet/folder hyperlinks). Remaining: upload it to Drive -> set config.js mainGuide -> run in-app createQuickGuides() [pcom].
- Task 5 (register in sync.sh + notes + propagate): Haroon registered in sync.sh COURSES; SETUP-NOTES.md written. PROPAGATION to other courses = no-op (only other deployed descendant was TimKraft demo; Elizabeth chose to leave it untracked; legacy Patrice/DonW/Eda forks excluded by policy).

## Completed log
- Task 1: complete (review clean, no Critical/Important). Files: Code.js (buildFlagOnlyRows_ + getConfig defaults + Node export guard), config.js (gradingMode/flagThreshold), .claspignore (test/**), test/flagOnly.test.js (new). node test GREEN; Code.js loads clean. ⚠️ items resolved by controller (getConfig append-only correct; equalShare formula matches bonus_ratio path; solo-team guard defensive).

- Task 2: complete (review clean, no Critical/Important). Code.js: generateGradebook split into shared prefix + config dispatch + shared tail; bonus_ratio logic extracted verbatim (minus internal sort) into buildGradebook_bonusRatio_; new buildGradebook_flagOnly_ added. bonus_ratio move byte-verified identical; buildFlagOnlyRows_ untouched; node checks green. In-sheet Step 5 deferred to Elizabeth [pcom].

## Final whole-branch review (opus): READY — Yes. No Critical/Important.
- Verified backward-compat chain end to end: sync.sh copies only Code.js/Index.html/Instructions.html/QuickGuides.js (never config.js), so existing courses run new Code.js over old config.js; getConfig fallbacks + dispatch default hold → bonus_ratio branch. bonus_ratio extraction byte-identical (only cosmetic alert suffix "(mode: bonus_ratio)"). flag_only semantics match spec; test covers edge + 0.75 boundary. test/** ignore is load-bearing (top-level require would break GAS compile).
- Minor (optional, non-blocking): (a) flag uses unrounded ratio while col H displays rounded F/G — can visibly disagree at the boundary; cosmetic since grade is 100 regardless. (b) flag_threshold `||` swallows explicit 0. (c) pre-existing formula-injection surface on roster cells (unchanged). (d) deliberate formatting duplication between the two builders (plan-chosen structure).
- Aware-of (cannot trigger in this rollout): Sheet.clear() doesn't clear cell notes; header notes sit on different cols per mode, so toggling a live sheet between modes would leave stale notes. MBA 590 is flag_only from a fresh sheet; existing courses stay bonus_ratio — never toggled.

## Follow-up change (2026-07-22): folder IDs written as URLs
Requested by Elizabeth. setupFolders() now writes `reflection_folder_id`/`summary_folder_id` to the Config tab as full Drive URLs (`https://drive.google.com/drive/folders/<id>`) instead of bare IDs. Added pure `folderIdFromConfig_()` extractor (handles /folders/, u/0/folders, open?id=, and bare-ID passthrough) used by both consumers (generateSummaryDocs, generateTeamReflectionDocs) so getFolderById still works. Backward-compatible: older courses storing bare IDs keep working. Test: test/folderId.test.js (all pass); flag-only regression still green; Code.js loads clean. Synced to Haroon (identical). TO APPLY LIVE: Haroon needs `clasp push --force` + re-run 📁 Set Up Output Folders (rewrites its existing raw-ID Config values as URLs).

## Follow-up change (2026-07-22): QuickGuides.js flag-only grading box
Found that createQuickGuides()'s grading box was hardcoded to bonus_ratio (said non-submitters=0, Grade=ratio×100) — wrong for a flag_only course. addGradingBox_ now dispatches on COURSE.gradingMode; new addGradingBoxFlagOnly_(cell) describes the flag-only scheme (everyone 100, flag if reviewed and < flag_threshold, non-submit never penalized, Flag column, Override). bonus_ratio path byte-unchanged. node --check clean; no em-dashes in new text; synced to Haroon (identical). Note: createQuickGuides() reads COURSE.label + urls.mainGuide, so fill real label/subtitle + the uploaded guide URL before generating for a clean result. createQuickGuides() runs from the editor Run button (no getUi).

## Minor findings to hand to final review
- Task 2 (brief-mandated, not a defect): `Number(config.flag_threshold) || 0.75` discards an explicit `0`. Degenerate (threshold 0 never flags anyway). Leave as-is unless an instructor use-case needs 0.
- Task 2 (brief-mandated): Final-Grade header note phrases the formula as IF(Override<>"",Override,100) while the cell formula is =IF(L<>"",L,K) (K always 100). Functionally identical.
- Task 1 test: "solo team never flagged" branch not exercised independently (Sol has 0 reviews, short-circuits before the equalShare>0 guard). Add a solo-team-WITH-reviews fixture to prove the guard.
- Task 1 test: no direct assertion that a solo member's equalShare cell (rows[i][6]) === 0.
- Task 1: getConfig() default-append change has no executed test coverage (Node test never calls getConfig). Low risk (2-line append); verify in-sheet during Task 2 Step 5.
