#!/bin/sh
# Double-click (or: sh start.sh) to run the site with no setup.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS from https://nodejs.org/ first."
  exit 1
fi
echo "Starting the site at http://localhost:5173/  (admin: /admin)"
if command -v xdg-open >/dev/null 2>&1; then (sleep 1; xdg-open http://localhost:5173/ >/dev/null 2>&1 &) 
elif command -v open >/dev/null 2>&1; then (sleep 1; open http://localhost:5173/ >/dev/null 2>&1 &) fi
node scripts/serve.mjs
