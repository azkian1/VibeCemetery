import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const frameSize = 627;
const outputWidth = frameSize * 2;
const output = Buffer.alloc(outputWidth * frameSize * 4);
const variants = [
  { gid: 39, file: 'living-compact-80-cyber-50-neon.png' },
  { gid: 46, file: 'dead-diagonal-80-cyber.png' },
];

function opaqueBounds(data, width, height, threshold = 40) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('Tree has no visible pixels');
  return { left, top, width: right - left + 1, height: bottom - top + 1, bottom };
}

for (const [index, variant] of variants.entries()) {
  const atlasNumber = String(Math.floor((variant.gid - 35) / 4) + 1).padStart(2, '0');
  const frame = (variant.gid - 35) % 4;
  const atlasPath = path.join(root, 'public', 'map', 'open-art', `tree-atlas-cybergothic-v2-${atlasNumber}.webp`);
  const { data: currentPixels } = await sharp(atlasPath)
    .extract({
      left: (frame % 2) * frameSize,
      top: Math.floor(frame / 2) * frameSize,
      width: frameSize,
      height: frameSize,
    })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const currentBounds = opaqueBounds(currentPixels, frameSize, frameSize);

  const conceptPath = path.join(root, 'artifacts', 'tree-concepts', 'high-cyber', variant.file);
  const { data: conceptPixels, info: conceptInfo } = await sharp(conceptPath)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const conceptBounds = opaqueBounds(conceptPixels, conceptInfo.width, conceptInfo.height);
  const scale = Math.min(
    currentBounds.width / conceptBounds.width,
    currentBounds.height / conceptBounds.height,
  );
  const drawWidth = Math.round(conceptBounds.width * scale);
  const drawHeight = Math.round(conceptBounds.height * scale);
  const centerX = currentBounds.left + currentBounds.width / 2;
  const drawLeft = Math.max(0, Math.min(frameSize - drawWidth, Math.round(centerX - drawWidth / 2)));
  const drawTop = Math.max(0, Math.min(frameSize - drawHeight, currentBounds.bottom + 1 - drawHeight));
  const { data: replacement } = await sharp(conceptPath)
    .extract({
      left: conceptBounds.left,
      top: conceptBounds.top,
      width: conceptBounds.width,
      height: conceptBounds.height,
    })
    .resize(drawWidth, drawHeight)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < drawHeight; y++) {
    replacement.copy(
      output,
      ((drawTop + y) * outputWidth + index * frameSize + drawLeft) * 4,
      y * drawWidth * 4,
      (y + 1) * drawWidth * 4,
    );
  }
  console.log(`High-cyber tree ${variant.gid}: ${currentBounds.width}×${currentBounds.height} → ${drawWidth}×${drawHeight}`);
}

const outputPath = path.join(root, 'public', 'map', 'open-art', 'tree-atlas-high-cyber-80.webp');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: outputWidth, height: frameSize, channels: 4 } })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(outputPath);
console.log(`Built ${path.basename(outputPath)}`);
