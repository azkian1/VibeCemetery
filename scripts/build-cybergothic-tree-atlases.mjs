import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const frameSize = 627;
const atlasSize = frameSize * 2;
const conceptByGid = new Map([
  [35, { file: 'dead-oak-cybergothic-gid35-v2.png' }],
  [36, { file: 'living-oak-gid36-concept-v2.png' }],
  [39, { file: 'living-yew-gid39-concept-v2.png' }],
  [42, { file: 'living-wide-gid42-concept-v2.png' }],
  // This sapling's new natural silhouette is wider than its old sprite.
  // Keep its proportions and allow only a modest crown expansion.
  [45, { file: 'dead-sapling-cybergothic-gid45-v2.png', widthLimit: 1.25 }],
  [46, { file: 'dead-diagonal-cybergothic-gid46-v2.png' }],
]);

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
  if (right < left) throw new Error('Tree frame has no visible pixels');
  return { left, top, width: right - left + 1, height: bottom - top + 1, bottom };
}

for (let atlasNumber = 1; atlasNumber <= 4; atlasNumber++) {
  const number = String(atlasNumber).padStart(2, '0');
  const sourcePath = path.join(root, 'artifacts', 'painted-map-sources', `tree-atlas-${number}.png`);
  const { data: atlas } = await sharp(sourcePath).resize(atlasSize, atlasSize, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let frame = 0; frame < 4; frame++) {
    const gid = 35 + (atlasNumber - 1) * 4 + frame;
    const concept = conceptByGid.get(gid);
    if (!concept) continue;
    const frameLeft = (frame % 2) * frameSize;
    const frameTop = Math.floor(frame / 2) * frameSize;
    const originalFrame = Buffer.alloc(frameSize * frameSize * 4);
    for (let y = 0; y < frameSize; y++) {
      atlas.copy(originalFrame, y * frameSize * 4,
        ((frameTop + y) * atlasSize + frameLeft) * 4,
        ((frameTop + y) * atlasSize + frameLeft + frameSize) * 4);
    }
    const originalBounds = opaqueBounds(originalFrame, frameSize, frameSize);
    const conceptPath = path.join(root, 'artifacts', 'tree-concepts', concept.file);
    const { data: conceptPixels, info: conceptInfo } = await sharp(conceptPath)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const conceptBounds = opaqueBounds(conceptPixels, conceptInfo.width, conceptInfo.height);
    const maxWidth = Math.min(frameSize - 8, Math.round(originalBounds.width * (concept.widthLimit ?? 1)));
    const maxHeight = Math.min(frameSize - 8, originalBounds.height);
    const scale = Math.min(maxWidth / conceptBounds.width, maxHeight / conceptBounds.height);
    const drawWidth = Math.round(conceptBounds.width * scale);
    const drawHeight = Math.round(conceptBounds.height * scale);
    const centerX = originalBounds.left + originalBounds.width / 2;
    const drawLeft = Math.max(0, Math.min(frameSize - drawWidth, Math.round(centerX - drawWidth / 2)));
    const drawTop = Math.max(0, Math.min(frameSize - drawHeight, originalBounds.bottom + 1 - drawHeight));
    const { data: replacement } = await sharp(conceptPath)
      .extract({ left: conceptBounds.left, top: conceptBounds.top,
        width: conceptBounds.width, height: conceptBounds.height })
      .resize(drawWidth, drawHeight)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    for (let y = 0; y < frameSize; y++) {
      atlas.fill(0, ((frameTop + y) * atlasSize + frameLeft) * 4,
        ((frameTop + y) * atlasSize + frameLeft + frameSize) * 4);
    }
    for (let y = 0; y < drawHeight; y++) {
      replacement.copy(atlas, ((frameTop + drawTop + y) * atlasSize + frameLeft + drawLeft) * 4,
        y * drawWidth * 4, (y + 1) * drawWidth * 4);
    }
    console.log(`Tree ${gid}: ${originalBounds.width}×${originalBounds.height} → ${drawWidth}×${drawHeight}`);
  }

  const outputPath = path.join(root, 'public', 'map', 'open-art', `tree-atlas-cybergothic-v2-${number}.webp`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(atlas, { raw: { width: atlasSize, height: atlasSize, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(outputPath);
  console.log(`Built ${path.basename(outputPath)}`);
}
