#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/run_silent.sh"
cd "$ROOT"

print_header "heating-schedule-card" "Checks"
run_silent "Syntax" "node --check heating-schedule-card.js"
run_silent "JSON"   "for f in \$(git ls-files '*.json'); do node -e 'JSON.parse(require(\"fs\").readFileSync(process.argv[1], \"utf8\"))' \"\$f\" || exit 1; done"
[ -d node_modules ] || run_silent "Install" "npm ci --no-fund --no-audit"
run_silent "Tests"  "npm test"
