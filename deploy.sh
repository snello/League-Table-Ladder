#!/usr/bin/env bash
# deploy.sh — sync league ladder to S3 and invalidate changed CloudFront paths
#
# Usage: ./deploy.sh [--force-invalidation]
#   --force-invalidation   invalidate /* even if no files changed
set -euo pipefail

BUCKET="${S3_BUCKET}"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID}"
S3_HOST="${S3_HOST}"
FORCE_INVALIDATION=false

for arg in "$@"; do
  case "$arg" in
    --force-invalidation) FORCE_INVALIDATION=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Run from the project root regardless of where the script is called from
cd "$(dirname "$0")"

# ── Sync ──────────────────────────────────────────────────────────────────────
echo "Syncing to S3…"

# Capture output from each sync so we can extract only the changed paths.
# aws s3 sync prints "upload: <local> to s3://<bucket>/<key>" for each changed file.

sync_output=""

# Static files at root
sync_output+=$(aws s3 sync . "$BUCKET/" \
  --exclude "*" \
  --include "index.html" \
  --include "data.json" \
  --include "comps.json" 2>&1)
sync_output+=$'\n'

# Team badge images (skip silently if directory doesn't exist yet)
if [ -d images ]; then
  sync_output+=$(aws s3 sync images/ "$BUCKET/images/" 2>&1)
  sync_output+=$'\n'
fi

# Fixture JSON files (skip silently if directory doesn't exist yet)
if [ -d fixtures ]; then
  sync_output+=$(aws s3 sync fixtures/ "$BUCKET/fixtures/" 2>&1)
  sync_output+=$'\n'
fi

# Print what was uploaded
echo "$sync_output" | grep "^upload:" || echo "  (nothing changed)"

# ── CloudFront invalidation ───────────────────────────────────────────────────

# Extract CloudFront paths from upload lines:
#   "upload: foo to ${S3_BUCKET}/foo"
#   → "/projects/league-ladder/foo"
cf_paths=()
while IFS= read -r line; do
  cf_paths+=("$line")
done < <(
  echo "$sync_output" \
    | grep "^upload:" \
    | sed "s|.*to s3://${S3_HOST}||" \
    | sort -u
)

if [ ${#cf_paths[@]} -eq 0 ] && [ "$FORCE_INVALIDATION" = false ]; then
  echo ""
  echo "Nothing changed — skipping CloudFront invalidation."
  exit 0
fi

echo ""
if [ "$FORCE_INVALIDATION" = true ]; then
  echo "Force-invalidating /* on CloudFront…"
  invalidation_paths=("/*")
else
  echo "Invalidating ${#cf_paths[@]} path(s) on CloudFront…"
  printf '  %s\n' "${cf_paths[@]}"
  invalidation_paths=("${cf_paths[@]}")
fi
echo ""

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "${invalidation_paths[@]}" \
  --query 'Invalidation.{Id:Id,Status:Status}' \
  --output table

echo ""
echo "Done."
