#!/bin/sh
set -eu

clasp_bin="./node_modules/.bin/clasp"
if [ ! -x "$clasp_bin" ]; then
  echo "Project dependencies are missing. Run: npm install" >&2
  exit 1
fi

backup="$(mktemp)"
trap 'rm -f "$backup"' EXIT
cp src/appsscript.json "$backup"

"$clasp_bin" create --type sheets --title "Team 9470 Attendance 2026-27" --rootDir src
cp "$backup" src/appsscript.json

# Older clasp releases placed the project file inside rootDir.
if [ ! -f .clasp.json ] && [ -f src/.clasp.json ]; then
  mv src/.clasp.json .clasp.json
fi

"$clasp_bin" push
