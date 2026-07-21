#!/bin/bash
# Umbra Studio - Tool Manager Launcher

cd "$(dirname "${BASH_SOURCE[0]}")"
export PATH="$HOME/.bun/bin:$PATH"

BUN_BIN="$(dirname "${BASH_SOURCE[0]}")/Runtime/Bun/$(uname -s | tr '[:upper:]' '[:lower:]')/bun"
if [ ! -x "$BUN_BIN" ]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
  else
    echo "[ERROR] Bun is not installed."
    echo "Install Bun first: https://bun.sh"
    exit 1
  fi
fi

echo "Launching Umbra Studio Tool Manager..."
"$BUN_BIN" manage-tools.ts
