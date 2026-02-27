import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.resolve(__dirname, '../public/assets');
const outDir = path.resolve(__dirname, '../dist-tauri/common');
const outPath = path.resolve(outDir, 'assets.zip');

console.log(`Zipping ${targetDir} ...`);

// Ensure output dir exists
fs.mkdirSync(outDir, { recursive: true });

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

output.on('close', () => {
  console.log(`✓ Created assets zip for Steam at ${outPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn(err);
  } else {
    throw err;
  }
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// append files from a sub-directory, putting its contents in the "assets" folder inside the zip
archive.directory(targetDir, 'assets');

archive.finalize();
