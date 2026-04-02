import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICON_SOURCE = path.resolve(__dirname, './gfx/icons/icon.png');
const ICON_DEMO_SOURCE = path.resolve(__dirname, './gfx/icons/icon_demo.png');
const OUT_DIR = path.resolve(__dirname, '../public/assets/icons');
const DIST_DIR = path.resolve(__dirname, '../dist/icons'); // demo + icns — not shipped

const SIZES = {
  'icon-16x16.png': 16,
  'icon-24x24.png': 24,
  'icon-32x32.png': 32,
  'icon-48x48.png': 48,
  'icon-64x64.png': 64,
  'icon-96x96.png': 96,
  'icon-128x128.png': 128,
  'icon-180x180.png': 180,
  'icon-184x184.png': 184,
  'icon-192x192.png': 192,
  'icon-256x256.png': 256,
  'icon-512x512.png': 512
};

async function resizeIcon(source, size, outputPath) {
  await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toFile(outputPath);
}

/**
 * NEU: Erstellt ein Icon mit Safe-Zone für Android Maskable
 */
async function createMaskableIcon(source, size, outputPath) {
  const padding = Math.round(size * 0.15); // 15% Rand
  const innerSize = size - (padding * 2);

  await sharp(source)
    .resize(innerSize, innerSize, { fit: 'contain' })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 10, g: 10, b: 26, alpha: 1 } // #0a0a1a
    })
    .toFile(outputPath);
}

async function generateIcns(source, outputIcnsPath) {
  const iconsetSizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  const iconsetDir = path.join(os.tmpdir(), `_iconset_${Date.now()}.iconset`);
  fs.mkdirSync(iconsetDir, { recursive: true });

  try {
    for (const [filename, size] of iconsetSizes) {
      await resizeIcon(source, size, path.join(iconsetDir, filename));
    }
    execSync(`iconutil -c icns "${iconsetDir}" -o "${outputIcnsPath}"`);
  } finally {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
}

async function generateWebIcons() {
  if (!fs.existsSync(ICON_SOURCE)) {
    console.error(`Source icon not found at ${ICON_SOURCE}`);
    process.exit(1);
  }
  if (!fs.existsSync(ICON_DEMO_SOURCE)) {
    console.error(`Demo source icon not found at ${ICON_DEMO_SOURCE}`);
    process.exit(1);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  console.log(`Generating web icons from ${ICON_SOURCE}...`);

  try {
    for (const [filename, size] of Object.entries(SIZES)) {
      const outputPath = path.join(OUT_DIR, filename);
      await resizeIcon(ICON_SOURCE, size, outputPath);
      console.log(`✓ Generated ${filename}`);
    }

    // NEU: Maskable Icon generieren
    console.log('Generating maskable icon...');
    await createMaskableIcon(ICON_SOURCE, 512, path.join(OUT_DIR, 'icon-512x512-maskable.png'));

    console.log('Generating favicon.ico...');
    const buf = await pngToIco([
      path.join(OUT_DIR, 'icon-16x16.png'),
      path.join(OUT_DIR, 'icon-32x32.png'),
      path.join(OUT_DIR, 'icon-48x48.png'),
      path.join(OUT_DIR, 'icon-256x256.png'),
    ]);
    fs.writeFileSync(path.join(OUT_DIR, 'favicon.ico'), buf);
    console.log('✓ Generated favicon.ico');

    console.log('\nGenerating DEMO icons...');
    for (const [filename, size] of Object.entries(SIZES)) {
      const outputPath = path.join(DIST_DIR, filename);
      await resizeIcon(ICON_DEMO_SOURCE, size, outputPath);
      console.log(`✓ Generated dist/icons/${filename}`);
    }

    // NEU: Demo Maskable Icon
    await createMaskableIcon(ICON_DEMO_SOURCE, 512, path.join(DIST_DIR, 'icon-512x512-maskable.png'));

    console.log('Generating favicon_demo.ico...');
    const demoBuf = await pngToIco([
      path.join(DIST_DIR, 'icon-16x16.png'),
      path.join(DIST_DIR, 'icon-32x32.png'),
      path.join(DIST_DIR, 'icon-48x48.png'),
      path.join(DIST_DIR, 'icon-256x256.png'),
    ]);
    fs.writeFileSync(path.join(DIST_DIR, 'favicon_demo.ico'), demoBuf);
    console.log('✓ Generated dist/icons/favicon_demo.ico');

    if (process.platform === 'darwin') {
      console.log('\nGenerating .icns files...');
      await generateIcns(ICON_SOURCE, path.join(DIST_DIR, 'icon.icns'));
      console.log('✓ Generated dist/icons/icon.icns');
      await generateIcns(ICON_DEMO_SOURCE, path.join(DIST_DIR, 'icon_demo.icns'));
      console.log('✓ Generated dist/icons/icon_demo.icns');
    } else {
      console.log('\n⚠ Skipping .icns generation (macOS only)');
    }

    console.log('\nAll web icons generated successfully!');
  } catch (err) {
    console.error('Error generating web icons:', err);
    process.exit(1);
  }
}

generateWebIcons();