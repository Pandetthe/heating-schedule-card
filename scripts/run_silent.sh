#!/usr/bin/env bash

# Helper functions for running commands with clean output.
# Source this file; do not execute it directly.
#
# Usage:
#   source scripts/run_silent.sh
#   run_silent "Syntax" "node --check heating-schedule-card.js"
#
# Set VERBOSE=1 to see full command output.

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

VERBOSE=${VERBOSE:-0}

# Run command silently; print ✓ on success or ✗ + full output on failure.
run_silent() {
    local description="$1"
    local command="$2"

    if [ "$VERBOSE" = "1" ]; then
        echo "  → $command"
        eval "$command"
        return $?
    fi

    local tmp=$(mktemp)
    if eval "$command" > "$tmp" 2>&1; then
        printf "  ${GREEN}✓${NC} %s\n" "$description"
        rm -f "$tmp"
        return 0
    else
        local code=$?
        printf "  ${RED}✗${NC} %s\n" "$description"
        printf "${RED}Command: %s${NC}\n" "$command"
        cat "$tmp"
        rm -f "$tmp"
        return $code
    fi
}

print_header() {
    printf "\n${BLUE}[%s]${NC} %s:\n" "$1" "$2"
}
