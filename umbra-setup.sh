#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
SETUP_APP="$PWD/resources/app/setup/UmbraSetupApp.js"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime missing: $BUN_BIN"
  exit 1
fi
if [ ! -f "$SETUP_APP" ]; then
  echo "[ERROR] Standalone setup utility missing: $SETUP_APP"
  exit 1
fi
exec "$BUN_BIN" "$SETUP_APP" --root "$PWD" "$@"
