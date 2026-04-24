#!/usr/bin/env node
// Normalises electron-builder dir output to match the Tauri build layout:
//   Mac:   dist-tauri/electron-mac/DICEPTION.app/Contents/MacOS/  + Steam files next to .app
//   Win:   dist-tauri/electron-win/DICEPTION.exe  + Steam DLL + VDF
//   Linux: dist-tauri/electron-linux/DICEPTION + Steam .so + VDF
//
// Usage: node scripts/electron-postbuild.js <mac|win|linux>

import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const platform = process.argv[2];
if (!['mac', 'win', 'linux'].includes(platform)) {
    console.error('Usage: node electron-postbuild.js <mac|win|linux>');
    process.exit(1);
}

const ROOT = join(__dirname, '..');
const OUT  = join(ROOT, `dist-tauri/electron-${platform}`);
const VDF  = join(ROOT, 'steam/game_actions_X.vdf');
const RES  = join(ROOT, 'src-tauri/resources');

function cp(src, dest) {
    if (!existsSync(src)) { console.warn(`  skip (not found): ${src}`); return; }
    copyFileSync(src, dest);
    console.log(`  copied: ${relative(ROOT, src)} → ${relative(ROOT, dest)}`);
}

function rm(p) {
    if (!existsSync(p)) return;
    rmSync(p, { recursive: true, force: true });
    console.log(`  removed: ${relative(ROOT, p)}`);
}

// ── Mac ───────────────────────────────────────────────────────────────────────
if (platform === 'mac') {
    // electron-builder outputs mac-arm64/ or mac/ subdir — flatten it
    const archDirs = readdirSync(OUT).filter(n =>
        statSync(join(OUT, n)).isDirectory() && n !== 'DICEPTION.app'
    );
    for (const archDir of archDirs) {
        const src = join(OUT, archDir);
        for (const entry of readdirSync(src)) {
            const from = join(src, entry);
            const to   = join(OUT, entry);
            if (!existsSync(to)) {
                renameSync(from, to);
                console.log(`  moved: ${archDir}/${entry} → ${entry}`);
            }
        }
        rm(src);
    }

    // Steam dylib goes inside the .app bundle next to the binary
    const macOSDir = join(OUT, 'DICEPTION.app', 'Contents', 'MacOS');
    cp(join(RES, 'libsteam_api.dylib'), join(macOSDir, 'libsteam_api.dylib'));
    cp(VDF, join(macOSDir, 'game_actions_X.vdf'));
}

// ── Windows ───────────────────────────────────────────────────────────────────
if (platform === 'win') {
    // electron-builder outputs win-unpacked/ subdir — flatten it
    const unpackedDir = join(OUT, 'win-unpacked');
    if (existsSync(unpackedDir)) {
        for (const entry of readdirSync(unpackedDir)) {
            renameSync(join(unpackedDir, entry), join(OUT, entry));
            console.log(`  moved: win-unpacked/${entry} → ${entry}`);
        }
        rm(unpackedDir);
    }

    cp(join(RES, 'steam_api64.dll'), join(OUT, 'steam_api64.dll'));
    cp(VDF, join(OUT, 'game_actions_X.vdf'));

    // Rename main exe to DICEPTION.exe
    const exeName = readdirSync(OUT).find(n => n.endsWith('.exe') && n !== 'DICEPTION.exe');
    if (exeName) {
        renameSync(join(OUT, exeName), join(OUT, 'DICEPTION.exe'));
        console.log(`  renamed: ${exeName} → DICEPTION.exe`);
    }
}

// ── Linux ─────────────────────────────────────────────────────────────────────
if (platform === 'linux') {
    // electron-builder outputs linux-unpacked/ subdir — flatten it
    const unpackedDir = join(OUT, 'linux-unpacked');
    if (existsSync(unpackedDir)) {
        for (const entry of readdirSync(unpackedDir)) {
            renameSync(join(unpackedDir, entry), join(OUT, entry));
            console.log(`  moved: linux-unpacked/${entry} → ${entry}`);
        }
        rm(unpackedDir);
    }

    cp(join(RES, 'libsteam_api.so'), join(OUT, 'libsteam_api.so'));
    cp(VDF, join(OUT, 'game_actions_X.vdf'));

    // Rename main binary to DICEPTION (electron-builder names it after productName lowercased)
    const binName = readdirSync(OUT).find(n => {
        const full = join(OUT, n);
        return statSync(full).isFile() && !n.includes('.') && n !== 'DICEPTION';
    });
    if (binName) {
        renameSync(join(OUT, binName), join(OUT, 'DICEPTION'));
        console.log(`  renamed: ${binName} → DICEPTION`);
    }
}

// ── All platforms ─────────────────────────────────────────────────────────────
rm(join(OUT, 'builder-debug.yml'));

console.log(`electron-postbuild [${platform}] done`);
