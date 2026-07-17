#!/usr/bin/env bash
# Lightweight, dependency-free secret-scanning backstop for the examples repo.
# Runs alongside gitleaks in CI. Fails (exit 1) when a tracked file contains a
# credential that looks real. Placeholders and synthetic fixtures are allowed.
#
# Usage: .github/scripts/secret-scan.sh
set -euo pipefail

if command -v rg >/dev/null 2>&1; then
  GREP() { rg -n --no-heading -e "$1" "$2"; }
else
  GREP() { grep -nE "$1" "$2"; }
fi

# Values that are obviously not real secrets.
PLACEHOLDER='SYNTHETIC|EXAMPLE|PLACEHOLDER|CHANGEME|changeme|your[_-]|YOUR[_-]|<[^>]+>|xxxx|X{4,}|\.\.\.'
# Paths where synthetic-but-secret-shaped strings are expected.
ALLOW_PATH='(^|/)(shared/fixtures/|.*\.example$|.*/README\.md$|\.github/scripts/secret-scan\.sh$|\.github/gitleaks\.toml$)'

# name=regex pairs of high-signal credential shapes.
PATTERNS=(
  'aws_access_key=AKIA[0-9A-Z]{16}'
  'gcp_api_key=AIza[0-9A-Za-z_\-]{35}'
  'slack_token=xox[baprs]-[0-9A-Za-z-]{10,}'
  'private_key=-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'pagou_live_secret=(sk|pk)_(live|prod)_[0-9A-Za-z]{12,}'
  'github_pat=(ghp|gho|ghs|ghu)_[0-9A-Za-z]{20,}'
  'generic_bearer=[Aa]uthorization:[[:space:]]*Bearer[[:space:]]+[0-9A-Za-z._\-]{24,}'
)

fail=0
files=$(git ls-files)

for f in $files; do
  # Skip allowlisted paths.
  if printf '%s' "$f" | grep -qE "$ALLOW_PATH"; then continue; fi
  # Skip binary files.
  if [ -f "$f" ] && grep -qI . "$f" 2>/dev/null; then :; else continue; fi

  for pair in "${PATTERNS[@]}"; do
    name="${pair%%=*}"
    regex="${pair#*=}"
    if hits=$(GREP "$regex" "$f" 2>/dev/null); then
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        # Ignore matches whose line is clearly a placeholder.
        if printf '%s' "$line" | grep -qE "$PLACEHOLDER"; then continue; fi
        echo "POTENTIAL SECRET [$name] in $f:"
        echo "  $line"
        fail=1
      done <<< "$hits"
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Secret scan FAILED. Remove the credential and rotate it. Use placeholders in .env.example."
  exit 1
fi

echo "Secret scan passed (no credentials detected)."
