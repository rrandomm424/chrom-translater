const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

const ICON_SIZES = [16, 48, 128];
const ICONS_DIR = path.join(__dirname, '..', 'src', 'icons');

const GRADIENT_COLORS = [
  { r: 102, g: 126, b: 234 },  // #667eea
  { r: 118, g: 75, b: 162 }    // #764ba2
];

function lerpColor(color1, color2, t) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t)
  };
}

function createRoundedRectPath(width, height, radius) {
  const path = [];
  path.push(`M ${radius} 0`);
  path.push(`L ${width - radius} 0`);
  path.push(`Q ${width} 0 ${width} ${radius}`);
  path.push(`L ${width} ${height - radius}`);
  path.push(`Q ${width} ${height} ${width - radius} ${height}`);
  path.push(`L ${radius} ${height}`);
  path.push(`Q 0 ${height} 0 ${height - radius}`);
  path.push(`L 0 ${radius}`);
  path.push(`Q 0 0 ${radius} 0`);
  path.push('Z');
  return path.join(' ');
}

function pointInPath(x, y, width, height, radius) {
  const minDist = radius;
  const maxX = width - radius;
  const maxY = height - radius;
  
  if (x < radius && y < radius) {
    const dx = x - radius;
    const dy = y - radius;
    return dx * dx + dy * dy <= radius * radius;
  }
  
  if (x >= maxX && y < radius) {
    const dx = x - maxX;
    const dy = y - radius;
    return dx * dx + dy * dy <= radius * radius;
  }
  
  if (x < radius && y >= maxY) {
    const dx = x - radius;
    const dy = y - maxY;
    return dx * dx + dy * dy <= radius * radius;
  }
  
  if (x >= maxX && y >= maxY) {
    const dx = x - maxX;
    const dy = y - maxY;
    return dx * dx + dy * dy <= radius * radius;
  }
  
  return x >= 0 && x < width && y >= 0 && y < height;
}

async function createIcon(size) {
  const image = new Jimp(size, size, 0x00000000);
  const radius = Math.round(size * 0.15);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInPath(x, y, size, size, radius)) {
        const t = (x + y) / (2 * size);
        const color = lerpColor(GRADIENT_COLORS[0], GRADIENT_COLORS[1], t);
        const hex = Jimp.rgbaToInt(color.r, color.g, color.b, 255);
        image.setPixelColor(hex, x, y);
      }
    }
  }
  
  const fontSize = Math.round(size * 0.4);
  const text = '译';
  
  const font = await loadFont(fontSize);
  const textWidth = measureText(text, font);
  const textHeight = fontSize;
  
  const textX = Math.round((size - textWidth) / 2);
  const textY = Math.round((size - textHeight) / 2 + size * 0.05);
  
  drawText(image, text, textX, textY, font, 0xffffffff);
  
  const outputPath = path.join(ICONS_DIR, `icon${size}.png`);
  await image.writeAsync(outputPath);
  console.log(`✓ Generated: icon${size}.png (${size}x${size})`);
}

function loadFont(size) {
  return Promise.resolve({
    size: size,
    glyphs: createGlyphs()
  });
}

function createGlyphs() {
  const glyphs = {};
  
  glyphs['译'] = {
    width: 1,
    height: 1,
    data: null
  };
  
  return glyphs;
}

function measureText(text, font) {
  return font.size * text.length * 0.8;
}

function drawText(image, text, x, y, font, color) {
  const size = font.size;
  const charSize = size;
  const padding = size * 0.1;
  
  if (text === '译') {
    drawChineseCharacter(image, x, y, charSize, color);
  } else {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charX = x + i * charSize * 0.8;
      drawSimpleChar(image, char, charX, y, charSize, color);
    }
  }
}

function drawChineseCharacter(image, x, y, size, color) {
  const scale = size / 100;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  
  drawLine(image, 
    Math.round(x + 10 * scale), Math.round(y + 15 * scale),
    Math.round(x + 90 * scale), Math.round(y + 15 * scale),
    Math.round(4 * scale), color
  );
  
  drawLine(image,
    Math.round(centerX), Math.round(y + 10 * scale),
    Math.round(centerX), Math.round(y + 45 * scale),
    Math.round(4 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 15 * scale), Math.round(y + 40 * scale),
    Math.round(x + 85 * scale), Math.round(y + 40 * scale),
    Math.round(4 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 55 * scale), Math.round(y + 40 * scale),
    Math.round(x + 55 * scale), Math.round(y + 85 * scale),
    Math.round(4 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 15 * scale), Math.round(y + 55 * scale),
    Math.round(x + 45 * scale), Math.round(y + 55 * scale),
    Math.round(3 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 15 * scale), Math.round(y + 70 * scale),
    Math.round(x + 45 * scale), Math.round(y + 70 * scale),
    Math.round(3 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 15 * scale), Math.round(y + 85 * scale),
    Math.round(x + 45 * scale), Math.round(y + 85 * scale),
    Math.round(3 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 60 * scale), Math.round(y + 50 * scale),
    Math.round(x + 85 * scale), Math.round(y + 60 * scale),
    Math.round(3 * scale), color
  );
  
  drawLine(image,
    Math.round(x + 60 * scale), Math.round(y + 65 * scale),
    Math.round(x + 85 * scale), Math.round(y + 75 * scale),
    Math.round(3 * scale), color
  );
}

function drawSimpleChar(image, char, x, y, size, color) {
  const padding = size * 0.15;
  const innerSize = size - padding * 2;
  
  for (let py = 0; py < innerSize; py++) {
    for (let px = 0; px < innerSize * 0.7; px++) {
      const imgX = Math.round(x + padding + px);
      const imgY = Math.round(y + padding + py);
      image.setPixelColor(color, imgX, imgY);
    }
  }
}

function drawLine(image, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  
  let x = x1;
  let y = y1;
  
  while (true) {
    for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
      for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
        const px = x + tx;
        const py = y + ty;
        if (px >= 0 && py >= 0) {
          image.setPixelColor(color, px, py);
        }
      }
    }
    
    if (x === x2 && y === y2) break;
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

async function generateAllIcons() {
  console.log('Generating PNG icons...\n');
  
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }
  
  for (const size of ICON_SIZES) {
    await createIcon(size);
  }
  
  console.log('\n✓ All icons generated successfully!');
}

generateAllIcons().catch(console.error);
