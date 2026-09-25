import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const artDir = path.join(root, 'public', 'map', 'open-art');
const output = path.join(root, 'src', 'game', 'utils', 'paintedGraveBoundsV2.json');
const redrawIds = new Set(JSON.parse(await fs.readFile(path.join(root, 'src', 'game', 'utils', 'paintedGraveRedrawIdsV2.json'), 'utf8')));
const frameSize = 627;
const bounds = [];
for (let gid = 51; gid <= 97; gid++) {
  const index = gid - 51;
  const atlas = String(Math.floor(index / 4) + 1).padStart(2, '0');
  const frame = index % 4;
  const asset = redrawIds.has(gid) ? `grave-redraw-atlas-${atlas}.webp` : `grave-atlas-${atlas}.webp`;
  const { data, info } = await sharp(path.join(artDir, asset))
    .extract({ left: (frame % 2) * frameSize, top: Math.floor(frame / 2) * frameSize,
      width: frameSize, height: frameSize })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = frameSize, minY = frameSize, maxX = -1, maxY = -1;
  for (let y = 0; y < frameSize; y++) {
    for (let x = 0; x < frameSize; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 64) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error(`Empty grave art for GID ${gid}`);
  bounds.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
}
await fs.writeFile(output, `${JSON.stringify(bounds, null, 2)}\n`);
console.log(`Measured ${bounds.length} painted grave silhouettes.`);
