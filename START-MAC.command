#!/bin/bash
# Election Atlas 2026: double-click to open the local results dashboard.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install it from https://nodejs.org/ then try again."
  read -r -p "Press Enter to close..."
  exit 1
fi
(node --version)
(sleep 1.5; open 'http://localhost:8787') &
exec node server.mjs
