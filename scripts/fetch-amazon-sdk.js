#!/usr/bin/env node
// Downloads the Amazon IAP SDK from AMAZON_IAP_SDK_URL and places the JAR
// into src-tauri/gen/android/app/libs/ (created if absent).
// Run after android:init: npm run fetch-amazon-sdk
//
// AMAZON_IAP_SDK_URL may point to a ZIP or a bare JAR.
// If it's a ZIP, the first *.jar inside is extracted.

import { execSync }                          from 'child_process';
import { mkdirSync, copyFileSync, existsSync,
         rmSync, readdirSync, statSync }     from 'fs';
import { join, basename, extname }           from 'path';
import { tmpdir, platform }                  from 'os';

const url = process.env.AMAZON_IAP_SDK_URL;
if (!url) {
    console.error('[fetch-amazon-sdk] AMAZON_IAP_SDK_URL is not set.');
    process.exit(1);
}

const dest    = 'src-tauri/gen/android/app/libs';
const tmpFile = join(tmpdir(), 'amazon_iap_sdk_download');
const extract = join(tmpdir(), 'amazon_iap_sdk_extract');

mkdirSync(dest, { recursive: true });
if (existsSync(extract)) rmSync(extract, { recursive: true });

console.log('[fetch-amazon-sdk] Downloading...');
execSync(`curl -fsSL "${url}" -o "${tmpFile}"`);

function walk(dir, results = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, results);
        else results.push(full);
    }
    return results;
}

let jarPath;
if (url.endsWith('.zip') || url.includes('.zip?')) {
    console.log('[fetch-amazon-sdk] Extracting ZIP...');
    if (platform() === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Force -Path '${tmpFile}' -DestinationPath '${extract}'"`);
    } else {
        execSync(`unzip -o "${tmpFile}" -d "${extract}"`);
    }
    jarPath = walk(extract).find(f => extname(f) === '.jar');
    if (!jarPath) {
        console.error('[fetch-amazon-sdk] No .jar found in ZIP.');
        process.exit(1);
    }
} else {
    jarPath = tmpFile;
}

const out = join(dest, 'amazon-appstore-sdk.jar');
copyFileSync(jarPath, out);
console.log(`[fetch-amazon-sdk] → ${out}`);
console.log('[fetch-amazon-sdk] Done.');
