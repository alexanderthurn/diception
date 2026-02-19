#!/bin/bash
# Upload a built dist-steam directory to Steam via SteamCMD.
#
# Usage:
#   ./steam/upload_steam.sh          # upload both mac + win depots
#   ./steam/upload_steam.sh mac      # upload only the mac depot
#   ./steam/upload_steam.sh win      # upload only the win depot
#
# Requirements:
#   - steamcmd must be installed and on your PATH
#       macOS:  brew install steamcmd
#       Linux:  https://developer.valvesoftware.com/wiki/SteamCMD
#   - STEAM_USER env var must be set (or hardcoded below)
#       export STEAM_USER=your_steam_account
#   - Build before uploading:
#       npm run tauri:build:mac   →  then  ./steam/upload_steam.sh mac
#       npm run tauri:build:win   →  then  ./steam/upload_steam.sh win

set -e

# ─── Configuration ────────────────────────────────────────────────────────────

# Read from environment, fall back to the value hardcoded here.
# Do NOT commit a real username/password to source control.
STEAM_USER="${STEAM_USER:-}"

# steamcmd is called interactively — it will prompt for password and 2FA.
# For CI/automation you can pass STEAM_PASS and STEAM_TOTP as env vars and
# extend the +login line below.

# ─── Paths (always relative to this script, not the caller's cwd) ─────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/../dist-steam"

# ─── Validation ───────────────────────────────────────────────────────────────

if [ -z "$STEAM_USER" ]; then
    echo "Error: STEAM_USER is not set."
    echo "  export STEAM_USER=your_steam_username  then re-run."
    exit 1
fi

if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
    echo "Error: dist-steam/ is empty or missing."
    echo "  Run 'npm run tauri:build:mac' or 'npm run tauri:build:win' first."
    exit 1
fi

if ! command -v steamcmd &>/dev/null; then
    echo "Error: steamcmd not found on PATH."
    echo "  macOS:  brew install steamcmd"
    echo "  Linux:  see https://developer.valvesoftware.com/wiki/SteamCMD"
    exit 1
fi

# ─── VDF selection ────────────────────────────────────────────────────────────

PLATFORM="${1:-}"
case "$PLATFORM" in
    mac) VDF="$SCRIPT_DIR/app_build_mac.vdf" ;;
    win) VDF="$SCRIPT_DIR/app_build_win.vdf" ;;
    "")  VDF="$SCRIPT_DIR/app_build.vdf"     ;;
    *)
        echo "Usage: $0 [mac|win]"
        echo "  no argument = upload both platforms using app_build.vdf"
        exit 1
        ;;
esac

# ─── Upload ───────────────────────────────────────────────────────────────────

echo "Uploading $(basename "$VDF") to Steam as $STEAM_USER ..."
echo "Content root: $DIST_DIR"
echo ""

steamcmd +login "$STEAM_USER" +run_app_build "$VDF" +quit

echo ""
echo "Done. Check steam/output/ for the build log."
