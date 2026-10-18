#!/bin/sh
# Double-click (or: sh expose.sh) to join every deployed copy to this computer.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS from https://nodejs.org/ first."
  exit 1
fi
echo "Joining every deployed copy to this computer. Leave this window open."
node scripts/expose.mjs
