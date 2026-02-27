const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const ICON_SOURCE = path.resolve(__dirname, '../public/assets/icons/icon.png');
const OUT_DIR = path.resolve(__dirname, '../public/assets/icons');

const SIZES = {
  'android-chrome-192x192.png': 192,
  'android-chrome-512x512.png': 512,
  '512x512.png': 512,
  'apple-touch-icon.png': 180,
  'favicon-32x32.png': 32,
  'favicon-16x16.png': 16
};

async function generateWebIcons() {
  if (!fs.existsSync(ICON_SOURCE)) {
    console.error(`Source icon not found at ${ICON_SOURCE}`);
    process.exit(1);
  }

  console.log(`Generating web icons from ${ICON_SOURCE}...`);

  try {
    // Generate PNGs
    for (const [filename, size] of Object.entries(SIZES)) {
      const outputPath = path.join(OUT_DIR, filename);
      await sharp(ICON_SOURCE)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toFile(outputPath);
      console.log(`✓ Generated ${filename}`);
    }

    // Generate favicon.ico from 16 and 32 PNGs
    console.log('Generating favicon.ico...');
    const buf = await pngToIco([
      path.join(OUT_DIR, 'favicon-16x16.png'),
      path.join(OUT_DIR, 'favicon-32x32.png')
    ]);
    
    fs.writeFileSync(path.join(OUT_DIR, 'favicon.ico'), buf);
    console.log('✓ Generated favicon.ico');

    console.log('All web icons generated successfully!');
  } catch (err) {
    console.error('Error generating web icons:', err);
    process.exit(1);
  }
}

generateWebIcons();
