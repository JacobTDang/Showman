#!/usr/bin/env bash
# Merge a PR ONLY when every check has completed and passed.
#
# Why this exists: this repo is on a GitHub plan without branch protection, so nothing
# server-side stops a merge while checks are pending/red — and that has bitten us twice
# (PR #54 merged over a red determinism job; PR #80 merged while Test+build was still
# pending). This script is the mechanical guard: it refuses unless the full check list
# is green. Use it instead of `gh pr merge` directly.
#
# Usage:  bash scripts/merge-when-green.sh <pr-number>
set -euo pipefail

PR="${1:?usage: merge-when-green.sh <pr-number>}"

CHECKS="$(gh pr checks "$PR" 2>/dev/null || true)"
if [ -z "$CHECKS" ]; then
  echo "FAIL: no checks reported for PR #$PR (CI not started?)"; exit 1
fi

# gh pr checks output is TAB-separated: <name>\t<status>\t… (names contain spaces).
TOTAL=$(printf '%s\n' "$CHECKS" | grep -c . || true)
PASS=$(printf '%s\n' "$CHECKS" | awk -F'\t' '$2=="pass"' | grep -c . || true)

if [ "$TOTAL" -eq 0 ] || [ "$PASS" -ne "$TOTAL" ]; then
  echo "REFUSING to merge PR #$PR: $PASS/$TOTAL checks passing."
  printf '%s\n' "$CHECKS" | awk -F'\t' '$2!="pass"'
  exit 1
fi

echo "All $TOTAL checks green — merging PR #$PR."
gh pr merge "$PR" --squash --delete-branch
