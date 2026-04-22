const fs = require('fs');
const path = require('path');

const ICON_SIZES = [16, 48, 128];
const ICONS_DIR = path.join(__dirname, '..', 'src', 'icons');

function createSVG(size) {
  const halfSize = size / 2;
  const padding = size * 0.15;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="gradient${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#gradient${size})"/>
  <text x="${halfSize}" y="${halfSize + size * 0.12}" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">译</text>
</svg>`;
}

function generateIcons() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }
  
  ICON_SIZES.forEach(size => {
    const svgContent = createSVG(size);
    const filePath = path.join(ICONS_DIR, `icon${size}.svg`);
    fs.writeFileSync(filePath, svgContent, 'utf8');
    console.log(`Generated: icon${size}.svg`);
  });
  
  console.log('\n提示: SVG 图标已生成。请使用以下方法之一将 SVG 转换为 PNG:');
  console.log('1. 在浏览器中打开 SVG 文件，右键另存为 PNG');
  console.log('2. 使用在线转换工具 (如 https://svgtopng.com/)');
  console.log('3. 使用 ImageMagick 等工具批量转换');
  console.log('\n需要的 PNG 文件:');
  ICON_SIZES.forEach(size => {
    console.log(`  - icon${size}.png (${size}x${size})`);
  });
}

generateIcons();
