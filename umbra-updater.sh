#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
UPDATER_BOOTSTRAP="$PWD/resources/app/launcher/UmbraUpdaterBootstrap.js"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime missing: $BUN_BIN"
  exit 1
fi
if [ ! -f "$UPDATER_BOOTSTRAP" ]; then
  echo "[ERROR] Standalone updater missing: $UPDATER_BOOTSTRAP"
  exit 1
fi
exec "$BUN_BIN" "$UPDATER_BOOTSTRAP" --root "$PWD" "$@"
