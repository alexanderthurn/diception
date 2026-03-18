#!/usr/bin/env node
// Downloads the Steam SDK zip from STEAM_SDK_ZIP_URL and extracts the
// redistributable libraries into src-tauri/resources/.
// Run once before building: npm run fetch-steam-sdk

import { execSync }                                       from 'child_process';
import { mkdirSync, copyFileSync, existsSync, rmSync,
         readdirSync, statSync }                          from 'fs';
import { join, basename, dirname }                        from 'path';
import { tmpdir, platform }                               from 'os';

const url = process.env.STEAM_SDK_ZIP_URL;
if (!url) {
    console.error('[fetch-steam-sdk] STEAM_SDK_ZIP_URL is not set.');
    process.exit(1);
}

const zip     = join(tmpdir(), 'steam_sdk.zip');
const extract = join(tmpdir(), 'steam_sdk_extract');
const dest    = 'src-tauri/resources';

mkdirSync(dest, { recursive: true });
if (existsSync(extract)) rmSync(extract, { recursive: true });

console.log('[fetch-steam-sdk] Downloading...');
execSync(`curl -fsSL "${url}" -o "${zip}"`);

console.log('[fetch-steam-sdk] Extracting...');
if (platform() === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Force -Path '${zip}' -DestinationPath '${extract}'"`);
} else {
    execSync(`unzip -o "${zip}" -d "${extract}"`);
}

// Walk the extracted tree and collect all file paths.
function walk(dir, results = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, results);
        else results.push(full);
    }
    return results;
}
const allFiles = walk(extract);

// Each target: match by parent directory name + file name, regardless of nesting.
const targets = [
    { dir: 'osx',     file: 'libsteam_api.dylib', dest: 'libsteam_api.dylib' },
    { dir: 'win64',   file: 'steam_api64.dll',     dest: 'steam_api64.dll'    },
    { dir: 'linux64', file: 'libsteam_api.so',      dest: 'libsteam_api.so'   },
];

for (const target of targets) {
    const match = allFiles.find(
        f => basename(f) === target.file && basename(dirname(f)) === target.dir
    );
    const to = join(dest, target.dest);
    if (match) {
        copyFileSync(match, to);
        console.log(`[fetch-steam-sdk] → ${to}`);
    } else {
        console.warn(`[fetch-steam-sdk] Not found in zip: ${target.dir}/${target.file}`);
    }
}

console.log('[fetch-steam-sdk] Done.');
