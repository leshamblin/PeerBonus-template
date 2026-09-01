#!/usr/bin/env bash
# Sync shared Peer Bonus app files from this template into each course folder.
# Never copies per-course files (config.js, .clasp.json, deployment-id.txt,
# appsscript.json, SETUP-NOTES.md).
#
# Only template-descendant apps belong in COURSES. The legacy forks
# (Eda-MBA540-Bonus, DonW-Bonus-MBA544-*, Patrice-Bonus-*) predate the
# template and are code-incompatible — never add them. See README.md
# ("Freeze-and-migrate policy").
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
