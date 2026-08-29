#!/usr/bin/env bash
# deploy.sh — sync league ladder to S3 and invalidate changed CloudFront paths
#
# Usage: ./deploy.sh [--force-invalidation] [--force-sync]
#   --force-invalidation   invalidate /projects/league-ladder/* even if no files changed
#   --force-sync           re-upload every site asset (including index.html and favicons)
#                          and invalidate /projects/league-ladder/*
set -Eeuo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S%z')" "$*"
}

on_error() {
  local status=$?
  log "ERROR: command failed on line ${BASH_LINENO[0]} (exit ${status}): ${BASH_COMMAND}" >&2
  exit "$status"
}

trap on_error ERR

AWS_BIN="${AWS_BIN:-$(command -v aws 2>/dev/null || true)}"
if [ -z "$AWS_BIN" ]; then
  for candidate in /usr/bin/aws /usr/local/bin/aws /home/snello/.local/bin/aws; do
    if [ -x "$candidate" ]; then
      AWS_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$AWS_BIN" ]; then
  log "ERROR: AWS CLI was not found. Set AWS_BIN to the aws executable." >&2
  exit 1
fi

run_aws() {
  local command_output status
  if command_output=$("$AWS_BIN" "$@" 2>&1); then
    printf '%s' "$command_output"
  else
    status=$?
    log "AWS command failed (exit $status): $AWS_BIN $*" >&2
    printf '%s\n' "$command_output" | sed 's/^/  /' >&2
    return "$status"
  fi
}

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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

START_TIME=$(date +%s)
log "Starting deployment"
log "Project: $SCRIPT_DIR"
log "Bucket: $BUCKET"
log "CloudFront distribution: $DISTRIBUTION_ID"
log "AWS CLI: $AWS_BIN"
log "Mode: force-sync=$FORCE_SYNC force-invalidation=$FORCE_INVALIDATION"

# ── Sync ──────────────────────────────────────────────────────────────────────
log "Syncing to S3"

# Capture output from each sync so we can extract only the changed paths.
# aws s3 sync prints "upload: <local> to s3://<bucket>/<key>" for each changed file.

sync_output=""

if [ "$FORCE_SYNC" = true ]; then
  log "Force sync enabled: uploading all site assets"

  # HTML, data, and favicons
  for f in index.html data.json comps.json favicon.svg favicon.ico apple-touch-icon.png \
            favicon-32x32.png favicon-64x64.png favicon-128x128.png; do
    if [ -f "$f" ]; then
      sync_output+=$(run_aws s3 cp "$f" "$BUCKET/$f" --no-progress)
      sync_output+=$'\n'
    fi
  done

  # Directories — use cp --recursive to bypass sync's change detection
  if [ -d images ]; then
    sync_output+=$(run_aws s3 cp images/ "$BUCKET/images/" --recursive --no-progress)
    sync_output+=$'\n'
  fi
  if [ -d fixtures ]; then
    sync_output+=$(run_aws s3 cp fixtures/ "$BUCKET/fixtures/" --recursive --no-progress)
    sync_output+=$'\n'
  fi

else
  log "Syncing changed root assets, images, and fixtures"
  # Root assets — sync performs content-based change detection.
  root_sync_output=$(run_aws s3 sync . "$BUCKET/" \
    --exclude "*" \
    --include "index.html" \
    --include "data.json" \
    --include "comps.json" \
    --include "favicon.svg" \
    --include "favicon.ico" \
    --include "apple-touch-icon.png" \
    --include "favicon-32x32.png" \
    --include "favicon-64x64.png" \
    --include "favicon-128x128.png" \
    --no-progress)
  sync_output+="$root_sync_output"
  sync_output+=$'\n'

  if [ -d images ]; then
    sync_output+=$(run_aws s3 sync images/ "$BUCKET/images/" --no-progress)
    sync_output+=$'\n'
  fi

  if [ -d fixtures ]; then
    sync_output+=$(run_aws s3 sync fixtures/ "$BUCKET/fixtures/" --no-progress)
    sync_output+=$'\n'
  fi
fi

# Print the complete AWS sync output for cron diagnostics.
if [ -n "$sync_output" ]; then
  log "AWS sync output:"
  printf '%s\n' "$sync_output" | sed 's/^/  /'
else
  log "AWS sync returned no output"
fi

changed_count=$(printf '%s\n' "$sync_output" | grep -c '^upload:' || true)
log "Changed files uploaded: $changed_count"

# ── CloudFront invalidation ───────────────────────────────────────────────────

# Extract CloudFront paths from upload lines:
#   "upload: foo to ${S3_BUCKET}/foo"
#   → "/projects/league-ladder/foo"
cf_paths=()
while IFS= read -r line; do
  cf_paths+=("$line")
done < <(
  printf '%s\n' "$sync_output" \
    | awk -v host="$S3_HOST" '/^upload:/ { sub("^.*to s3://" host, ""); print }' \
    | sort -u
)

if [ ${#cf_paths[@]} -eq 0 ] && [ "$FORCE_INVALIDATION" = false ]; then
  log "Nothing changed; skipping CloudFront invalidation"
  log "Deployment finished in $(( $(date +%s) - START_TIME ))s"
  exit 0
fi

if [ "$FORCE_INVALIDATION" = true ]; then
  log "Invalidating all CloudFront paths under /projects/league-ladder/*"
  invalidation_paths=("/projects/league-ladder/" "/projects/league-ladder/*")
else
  log "Invalidating ${#cf_paths[@]} CloudFront path(s)"
  printf '%s\n' "${cf_paths[@]}" | sed 's/^/  /'
  invalidation_paths=("${cf_paths[@]}")
fi

log "Submitting CloudFront invalidation request"
invalidation_output=$(run_aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "${invalidation_paths[@]}" \
  --query 'Invalidation.{Id:Id,Status:Status}' \
  --output table)
printf '%s\n' "$invalidation_output"

log "CloudFront invalidation request submitted"
log "Deployment finished in $(( $(date +%s) - START_TIME ))s"
