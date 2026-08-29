#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Cron does not load the interactive shell's PATH. Allow NODE_BIN to be
# configured explicitly, then check the usual system installation paths.
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
if [ -z "$NODE_BIN" ]; then
  for candidate in /usr/bin/node /usr/local/bin/node /opt/nodejs/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "Error: Node.js was not found. Set NODE_BIN to the node executable." >&2
  exit 1
fi

# Load secrets from a file that is readable only by the cron user.
ENV_FILE="${LEAGUE_LADDER_ENV_FILE:-/home/snello/.config/league-ladder.env}"
if [ -f "$ENV_FILE" ]; then
  . "$ENV_FILE"
fi

if [ -z "${FOOTBALL_DATA_API_KEY:-}" ]; then
  echo "Error: FOOTBALL_DATA_API_KEY is not set." >&2
  exit 1
fi
export FOOTBALL_DATA_API_KEY

"$NODE_BIN" fetch-standings.mjs --league PL
sleep 7
"$NODE_BIN" fetch-standings.mjs --league ELC
sleep 7
"$NODE_BIN" fetch-standings.mjs --league PD
sleep 7
"$NODE_BIN" fetch-standings.mjs --league BL1
sleep 7
"$NODE_BIN" fetch-standings.mjs --league PPL
sleep 7
"$NODE_BIN" fetch-standings.mjs --league FL1
sleep 7
"$NODE_BIN" fetch-standings.mjs --league DED
sleep 7
"$NODE_BIN" fetch-standings.mjs --league SA
"$NODE_BIN" cache-bust.js
./deploy.sh
