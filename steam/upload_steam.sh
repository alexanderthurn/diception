#!/bin/bash

# Steam credentials
STEAM_USER=""

if [ -z "$STEAM_USER" ]; then
    echo "Please set your STEAM_USER in steam/upload_steam.sh"
    exit 1
fi

# Run steamcmd
VDF_FILE="steam/app_build.vdf"
if [ "$1" == "mac" ]; then
    VDF_FILE="steam/app_build_mac.vdf"
elif [ "$1" == "win" ]; then
    VDF_FILE="steam/app_build_win.vdf"
fi

echo "Uploading using $VDF_FILE..."
steamcmd +login "$STEAM_USER" +run_app_build $(pwd)/$VDF_FILE +quit
