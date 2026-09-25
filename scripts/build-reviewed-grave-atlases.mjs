import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const ids = JSON.parse(await fs.readFile(path.join(root, 'src', 'game', 'utils', 'paintedGraveRedrawIdsV2.json'), 'utf8'));
const sourceDir = path.join(root, 'artifacts', 'painted-map-sources', 'grave-redraws');
const outputDir = path.join(root, 'public', 'map', 'open-art');
const frameSize = 627;

if (ids.length !== 23 || new Set(ids).size !== ids.length || ids.some((gid) => gid < 51 || gid > 97)) {
  throw new Error('Unexpected rejected grave GID list');
}

const byAtlas = new Map();
for (const gid of ids) {
  const source = path.join(sourceDir, `${gid}.png`);
  const { hasAlpha } = await sharp(source).metadata();
  if (!hasAlpha) throw new Error(`Redrawn grave ${gid} has no transparency`);
  const index = gid - 51;
  const atlas = Math.floor(index / 4) + 1;
  const frame = index % 4;
  const input = await sharp(source)
    .resize(frameSize, frameSize, { fit: 'contain', background: '#00000000' })
    .png().toBuffer();
  const frames = byAtlas.get(atlas) ?? [];
  frames.push({ input, left: (frame % 2) * frameSize, top: Math.floor(frame / 2) * frameSize });
  byAtlas.set(atlas, frames);
}

await fs.mkdir(outputDir, { recursive: true });
for (const [atlas, frames] of byAtlas) {
  const number = String(atlas).padStart(2, '0');
  await sharp({ create: {
    width: frameSize * 2, height: frameSize * 2,
    channels: 4, background: '#00000000',
  } }).composite(frames)
    .webp({ quality: 87, alphaQuality: 100, effort: 6 })
    .toFile(path.join(outputDir, `grave-redraw-atlas-${number}.webp`));
}
console.log(`Prepared ${ids.length} redrawn graves in ${byAtlas.size} separate atlases; approved art untouched.`);
