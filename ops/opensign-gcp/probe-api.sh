#!/usr/bin/env bash
# Discover which path the deployed OpenSign build serves its REST API on, so
# OPENSIGN_BASE_URL can be set to a verified value instead of a guessed one.
#
# Usage: probe-api.sh https://sign-1-2-3-4.sslip.io [api-token]
set -euo pipefail

BASE="${1:?usage: probe-api.sh <https://opensign-host> [api-token]}"
BASE="${BASE%/}"
TOKEN="${2:-}"

CANDIDATES=(
  "$BASE/api/v1"
  "$BASE/api/app/v1"
  "$BASE/v1"
  "$BASE/api"
)

echo "Probing OpenSign REST roots on $BASE"
printf '%-40s %-6s %s\n' "CANDIDATE (POST /createdocument)" "HTTP" "BODY (first 160 chars)"

for candidate in "${CANDIDATES[@]}"; do
  args=(-s -o /tmp/opensign-probe-body -w '%{http_code}' --max-time 15
        -X POST "$candidate/createdocument"
        -H 'Content-Type: application/json'
        --data '{}')
  if [ -n "$TOKEN" ]; then
    args+=(-H "x-api-token: $TOKEN")
  fi
  code="$(curl "${args[@]}" || echo 000)"
  body="$(head -c 160 /tmp/opensign-probe-body 2>/dev/null | tr '\n' ' ')"
  printf '%-40s %-6s %s\n' "$candidate" "$code" "$body"
done

rm -f /tmp/opensign-probe-body

cat <<'EOF'

How to read this:
  404 on every path      -> the image does not expose that route; check the image tag.
  401 / 403              -> route exists and is auth-gated. This is the right base URL.
  400 with a field error -> route exists and parsed the body. This is the right base URL.
Set OPENSIGN_BASE_URL to whichever candidate returned 400/401/403 rather than 404.
EOF
