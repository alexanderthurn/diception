#!/usr/bin/env node
// Copies the platform Steam API library from STEAMWORKS_SDK_PATH into src-tauri/resources/.
// Usage:  node scripts/copy-steam-sdk.js [mac|win|linux]
// If STEAMWORKS_SDK_PATH is not set the script exits silently (0) so local
// builds without the SDK still work.

import fs   from 'fs';
import path from 'path';

const sdkPath = process.env.STEAMWORKS_SDK_PATH;
if (!sdkPath) {
    console.log('[copy-steam-sdk] STEAMWORKS_SDK_PATH not set — skipping.');
    process.exit(0);
}

const platform = process.argv[2];
const map = {
    mac:   ['osx/libsteam_api.dylib',        'src-tauri/resources/libsteam_api.dylib'],
    win:   ['win64/steam_api64.dll',          'src-tauri/resources/steam_api64.dll'],
    linux: ['linux64/libsteam_api.so',        'src-tauri/resources/libsteam_api.so'],
};

if (!map[platform]) {
    console.error(`[copy-steam-sdk] Unknown platform "${platform}". Use mac, win, or linux.`);
    process.exit(1);
}

const [relSrc, dst] = map[platform];
const src = path.join(sdkPath, 'redistributable_bin', relSrc);

if (!fs.existsSync(src)) {
    console.error(`[copy-steam-sdk] Source not found: ${src}`);
    process.exit(1);
}

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log(`[copy-steam-sdk] ${src} → ${dst}`);
