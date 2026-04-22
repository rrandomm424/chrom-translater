const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const BUILD_DIR = path.join(DIST_DIR, 'chrome-extension');
const ZIP_PATH = path.join(DIST_DIR, 'web-translator-extension.zip');

const REQUIRED_FILES = [
  'manifest.json',
  'background/background.js',
  'content/content.js',
  'content/content.css',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'options/options.html',
  'options/options.css',
  'options/options.js'
];

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  ensureDirExists(destDir);
  fs.copyFileSync(src, dest);
  console.log(`  Copied: ${path.relative(SRC_DIR, src)}`);
}

function copyDirectory(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  
  entries.forEach(entry => {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  });
}

function validateRequiredFiles() {
  console.log('Validating required files...\n');
  let allValid = true;
  
  REQUIRED_FILES.forEach(file => {
    const filePath = path.join(SRC_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ ${file}`);
    } else {
      console.log(`  ✗ ${file} - MISSING`);
      allValid = false;
    }
  });
  
  console.log('');
  return allValid;
}

function checkIcons() {
  console.log('Checking icon files...\n');
  const iconDir = path.join(SRC_DIR, 'icons');
  const iconSizes = [16, 48, 128];
  let hasIcons = true;
  
  if (!fs.existsSync(iconDir)) {
    console.log('  ⚠ Icons directory not found. Creating placeholder icons...');
    fs.mkdirSync(iconDir, { recursive: true });
    
    iconSizes.forEach(size => {
      const svgPath = path.join(iconDir, `icon${size}.svg`);
      const svgContent = createPlaceholderIconSVG(size);
      fs.writeFileSync(svgPath, svgContent, 'utf8');
      console.log(`    Created placeholder: icon${size}.svg`);
    });
    
    console.log('\n  ⚠ IMPORTANT: Please convert SVG icons to PNG format manually.');
    console.log('    Chrome extensions require PNG icons. You can:');
    console.log('    1. Open SVG in browser, right-click -> Save as PNG');
    console.log('    2. Use online tools like https://svgtopng.com/');
    console.log(`    3. Place PNG files in: ${iconDir}`);
    console.log('');
    hasIcons = false;
  } else {
    iconSizes.forEach(size => {
      const pngPath = path.join(iconDir, `icon${size}.png`);
      if (fs.existsSync(pngPath)) {
        console.log(`  ✓ icon${size}.png`);
      } else {
        console.log(`  ⚠ icon${size}.png - Missing (SVG placeholder will be used)`);
        hasIcons = false;
      }
    });
  }
  
  console.log('');
  return hasIcons;
}

function createPlaceholderIconSVG(size) {
  const halfSize = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#grad)"/>
  <text x="${halfSize}" y="${halfSize + size * 0.12}" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">译</text>
</svg>`;
}

function updateManifestForBuild() {
  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  const iconDir = path.join(SRC_DIR, 'icons');
  const iconSizes = [16, 48, 128];
  
  iconSizes.forEach(size => {
    const pngPath = path.join(iconDir, `icon${size}.png`);
    const svgPath = path.join(iconDir, `icon${size}.svg`);
    
    if (!fs.existsSync(pngPath) && fs.existsSync(svgPath)) {
      console.log(`  ⚠ icon${size}.png not found, but SVG exists.`);
      console.log('    Chrome requires PNG icons. Please convert SVGs to PNGs.');
    }
  });
  
  console.log(`\n  Manifest version: ${manifest.version}`);
}

function createZip() {
  console.log('\nCreating distribution ZIP...\n');
  
  const zip = new AdmZip();
  zip.addLocalFolder(BUILD_DIR, '');
  zip.writeZip(ZIP_PATH);
  
  console.log(`  ✓ Created: ${path.relative(path.join(__dirname, '..'), ZIP_PATH)}`);
  
  const stats = fs.statSync(ZIP_PATH);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${fileSizeMB} MB`);
}

function build() {
  console.log('========================================');
  console.log('  Web Translator Extension Build');
  console.log('========================================\n');
  
  const filesValid = validateRequiredFiles();
  if (!filesValid) {
    console.log('ERROR: Some required files are missing.');
    process.exit(1);
  }
  
  checkIcons();
  
  console.log('Cleaning previous build...\n');
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }
  
  ensureDirExists(BUILD_DIR);
  
  console.log('Copying source files...\n');
  copyDirectory(SRC_DIR, BUILD_DIR);
  
  console.log('\nUpdating manifest...\n');
  updateManifestForBuild();
  
  createZip();
  
  console.log('\n========================================');
  console.log('  Build completed successfully!');
  console.log('========================================\n');
  
  console.log('Output files:');
  console.log(`  - Extension folder: ${BUILD_DIR}`);
  console.log(`  - Distribution ZIP: ${ZIP_PATH}\n`);
  
  console.log('Installation instructions:');
  console.log('  1. Open Chrome and go to: chrome://extensions/');
  console.log('  2. Enable "Developer mode" (top right corner)');
  console.log('  3. Click "Load unpacked"');
  console.log(`  4. Select the folder: ${BUILD_DIR}`);
  console.log('');
}

build();
