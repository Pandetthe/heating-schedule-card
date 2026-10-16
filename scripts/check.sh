#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/run_silent.sh"
cd "$ROOT"

print_header "heating-schedule-card" "Checks"
[ -d node_modules ] || run_silent "Install" "npm ci --no-fund --no-audit"
run_silent "JSON"   "for f in \$(git ls-files '*.json'); do node -e 'JSON.parse(require(\"fs\").readFileSync(process.argv[1], \"utf8\"))' \"\$f\" || exit 1; done"
run_silent "Build"  "npm run build"
run_silent "Tests"  "node --test 'tests/*.test.mjs'"
