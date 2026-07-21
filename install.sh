#!/bin/bash
# ============================================
# Umbra Studio - Universal Installer (Linux)
# ============================================
#
# Usage: ./install.sh [action]
#   No args           = Install/update all tools + shortcuts
#   comfyui           = Install/update ComfyUI
#   aitoolkit         = Install/update AI-Toolkit
#   update-comfyui    = Force update ComfyUI
#   update-aitoolkit  = Force update AI-Toolkit
#   comfy-nodes       = Install/update preferred ComfyUI custom nodes
#   shortcuts         = Rebuild root shortcuts
#
# Requirements:
#   - Bun runtime (https://bun.sh)
#   - Python 3.11
#   - Linux Python headers and compiler toolchain
#     Debian/Ubuntu: sudo apt install python3-dev build-essential libgl1 libglib2.0-0
#
# ============================================

cd "$(dirname "${BASH_SOURCE[0]}")"

# Add local Bun to PATH
export PATH="$HOME/.bun/bin:$PATH"

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo ""
    echo "[ERROR] Bun is not installed!"
    echo ""
    echo "Install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    exit 1
fi

if [ $# -eq 0 ]; then
    bun setup-tools.ts all
else
    bun setup-tools.ts "$@"
fi
