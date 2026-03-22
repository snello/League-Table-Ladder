#!/usr/bin/env bash
# deploy.sh — sync league ladder to S3 and invalidate changed CloudFront paths
#
# Usage: ./deploy.sh [--force-invalidation] [--force-sync]
#   --force-invalidation   invalidate /projects/league-ladder/* even if no files changed
#   --force-sync           re-upload every site asset (including index.html and favicons)
#                          and invalidate /projects/league-ladder/*
set -euo pipefail

BUCKET="${S3_BUCKET}"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID}"
S3_HOST="${S3_HOST}"
FORCE_INVALIDATION=false
FORCE_SYNC=false

for arg in "$@"; do
  case "$arg" in
    --force-invalidation) FORCE_INVALIDATION=true ;;
    --force-sync)         FORCE_SYNC=true; FORCE_INVALIDATION=true ;;
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

if [ "$FORCE_SYNC" = true ]; then
  echo "  (force-sync: uploading all site assets)"

  # HTML + favicons
  for f in index.html favicon.svg favicon.ico apple-touch-icon.png \
            favicon-32x32.png favicon-64x64.png favicon-128x128.png; do
    if [ -f "$f" ]; then
      sync_output+=$(aws s3 cp "$f" "$BUCKET/$f" --no-progress 2>&1)
      sync_output+=$'\n'
    fi
  done

  # Data files
  for f in data.json comps.json; do
    if [ -f "$f" ]; then
      sync_output+=$(aws s3 cp "$f" "$BUCKET/$f" --no-progress 2>&1)
      sync_output+=$'\n'
    fi
  done

  # Directories — use cp --recursive to bypass sync's change detection
  if [ -d images ]; then
    sync_output+=$(aws s3 cp images/ "$BUCKET/images/" --recursive --no-progress 2>&1)
    sync_output+=$'\n'
  fi
  if [ -d fixtures ]; then
    sync_output+=$(aws s3 cp fixtures/ "$BUCKET/fixtures/" --recursive --no-progress 2>&1)
    sync_output+=$'\n'
  fi

else
  # Normal sync: only upload changed data/image/fixture files
  for f in data.json comps.json; do
    if [ -f "$f" ]; then
      sync_output+=$(aws s3 cp "$f" "$BUCKET/$f" --no-progress 2>&1)
      sync_output+=$'\n'
    fi
  done

  if [ -d images ]; then
    sync_output+=$(aws s3 sync images/ "$BUCKET/images/" --no-progress 2>&1)
    sync_output+=$'\n'
  fi

  if [ -d fixtures ]; then
    sync_output+=$(aws s3 sync fixtures/ "$BUCKET/fixtures/" --no-progress 2>&1)
    sync_output+=$'\n'
  fi
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
  echo "Invalidating /projects/league-ladder/* on CloudFront…"
  invalidation_paths=("/projects/league-ladder/*")
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
