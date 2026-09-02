#!/usr/bin/env bash
# Sync shared Peer Bonus app files from this template into each course folder.
# Never copies per-course files (config.js, .clasp.json, deployment-id.txt,
# appsscript.json, SETUP-NOTES.md).
#
# Only template-descendant apps belong in COURSES. The legacy forks predate
# the template and are code-incompatible — never add them. See README.md
# ("Freeze-and-migrate policy"). As of 2026-09-02 the frozen forks are
# Eda-MBA540-Bonus, DonW-Bonus-MBA544-001/601, TimKraft-Bonus-Demo, and
# Patrice-Bonus-462-003/462-601/462-601-SummerI/464-Spain/469/566.
#
# Judge by lineage, not by folder name. Patrice-Bonus-MKT541-631-Fall2026 is
# registered below and belongs there: it was created from this template and
# only matches the legacy "Patrice-Bonus-*" shape by coincidence. Do not
# remove it while tidying. A descendant carries resolveRosterView_, which no
# legacy fork has, so run this from THIS folder to list every descendant
# that is not yet registered (no output means all of them are):
#
#   (cd .. && for d in */Code.js; do
#      grep -q resolveRosterView_ "$d" \
#        && ! grep -q "${d%/Code.js}" PeerBonus-template/sync.sh \
#        && echo "UNREGISTERED: ${d%/Code.js}"
#    done)
#
# An unregistered course silently stops receiving fixes.
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Course folders are siblings of this template. Derived, not hardcoded:
# $HOME/Documents/Programming and the iCloud Documents/Programming are two
# DIFFERENT directories on this machine, and the projects live in iCloud.
# The old hardcoded $HOME path made every course "SKIP — missing config.js",
# which reads like a broken course folder rather than a wrong prefix.
PROG_DIR="$(dirname "$TEMPLATE_DIR")"

COURSES=(
  # Add course folders here as they are created from the template, e.g.:
  # "$PROG_DIR/<Instructor>-Bonus-<Course>"
  "$PROG_DIR/Haroon-Bonus-MBA590"        # MBA 590 (Haroon Abbu); flag_only grading
  "$PROG_DIR/Patrice-Bonus-MKT541-631-Fall2026" # MKT-541(631) (Patrice) Fall 2026; bonus_ratio
  "$PROG_DIR/Ross-Bonus-462-Fall2026"    # BUS 462 (001 & 002) (Ross) Fall 2026; bonus_ratio
)

SHARED_FILES=(
  Code.js
  Index.html
  Instructions.html
  QuickGuides.js
)

PUSH=false
DEPLOY=false
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --deploy) DEPLOY=true ;;
    *) echo "Unknown flag: $arg (use --push and/or --deploy)"; exit 1 ;;
  esac
done

# --deploy confirms per course, which needs a keyboard. Without a terminal —
# an agent session, a pipe, cron — `read` gets EOF and the old code answered
# "no" for you: it printed SKIPPED DEPLOY for every course while otherwise
# looking like a normal successful run, so nothing deployed and it did not
# look like a failure. Refuse up front instead, before anything is copied.
if $DEPLOY && [[ ! -t 0 ]]; then
  cat >&2 <<'MSG'
ERROR: --deploy needs a real terminal to ask its per-course confirmation.
       Nothing was synced, pushed or deployed.

       Either run it yourself in Terminal:
         ./sync.sh --push --deploy

       …or push here and deploy one course explicitly:
         ./sync.sh --push
         cd ../<course-folder>
         clasp deploy --deploymentId "$(cat deployment-id.txt)"

       Passing the deployment ID reuses the live URL. A bare `clasp deploy`
       mints a new one and breaks the Moodle link.
MSG
  exit 1
fi

if [[ ${#COURSES[@]} -eq 0 ]]; then
  echo "No courses registered yet — add template-descendant folders to COURSES in $0"
  exit 0
fi

for course in "${COURSES[@]}"; do
  name="$(basename "$course")"
  if [[ ! -f "$course/config.js" || ! -f "$course/.clasp.json" ]]; then
    echo "SKIP   $name — missing config.js or .clasp.json"
    continue
  fi

  for f in "${SHARED_FILES[@]}"; do
    cp "$TEMPLATE_DIR/$f" "$course/$f"
  done
  echo "SYNCED $name (${#SHARED_FILES[@]} files)"

  if $PUSH; then
    if (cd "$course" && clasp push); then
      echo "PUSHED $name"
    else
      echo "PUSH FAILED $name — skipping deploy"
      continue
    fi
  fi

  if $DEPLOY; then
    if [[ ! -f "$course/deployment-id.txt" ]]; then
      echo "SKIP DEPLOY $name — missing deployment-id.txt"
      continue
    fi
    read -r -p "Deploy $name to its live URL? [y/N] " answer || answer=n
    if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
      (cd "$course" && clasp deploy --deploymentId "$(cat deployment-id.txt)")
      echo "DEPLOYED $name"
    else
      echo "SKIPPED DEPLOY $name"
    fi
  fi
done
