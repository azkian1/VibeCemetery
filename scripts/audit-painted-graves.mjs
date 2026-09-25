import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'public', 'map', 'open-art');
const outputDir = path.join(root, 'artifacts', 'visual-audits', 'graves');
const map = JSON.parse(await fs.readFile(path.join(root, 'public', 'map', 'cemetery-v2.tmj'), 'utf8'));
const redrawIds = new Set(JSON.parse(await fs.readFile(path.join(root, 'src', 'game', 'utils', 'paintedGraveRedrawIdsV2.json'), 'utf8')));
await fs.mkdir(outputDir, { recursive: true });

const frameSize = 627;
const categories = [
  { name: 'tall', first: 51, last: 76, width: 40, height: 74, maxWidth: 44, maxHeight: 72 },
  { name: 'wide', first: 77, last: 85, width: 74, height: 44, maxWidth: 72, maxHeight: 64 },
  { name: 'large', first: 86, last: 97, width: 76, height: 76, maxWidth: 76, maxHeight: 76 },
];
const records = [];

function tileLabel(gid, name) {
  const title = `${gid} ${name.replace(/^grave_[12]x[12]_/, '').slice(0, 21)}`;
  return Buffer.from(`<svg width="190" height="34"><text x="8" y="15" font-family="Arial" font-size="13" fill="#efe8d2">${title}</text></svg>`);
}

for (const category of categories) {
  const gids = Array.from({ length: category.last - category.first + 1 }, (_, index) => category.first + index);
  for (const mode of ['natural', 'current', 'proposed']) {
    const cols = 6;
    const rows = Math.ceil(gids.length / cols);
    const composites = [];
    for (let index = 0; index < gids.length; index++) {
      const gid = gids[index];
      const tileset = map.tilesets.find((item) => item.firstgid === gid);
      const atlasNumber = String(Math.floor((gid - 51) / 4) + 1).padStart(2, '0');
      const atlas = path.join(sourceDir, `${redrawIds.has(gid) ? 'grave-redraw-atlas' : 'grave-atlas'}-${atlasNumber}.webp`);
      const frame = (gid - 51) % 4;
      const input = sharp(atlas).extract({
        left: (frame % 2) * frameSize,
        top: Math.floor(frame / 2) * frameSize,
        width: frameSize,
        height: frameSize,
      }).ensureAlpha();
      const { data, info } = await input.clone().raw().toBuffer({ resolveWithObject: true });
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
      if (mode === 'natural') records.push({
        gid,
        type: category.name,
        source: tileset.name,
        alphaBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      });
      const scale = Math.min(category.maxWidth / (maxX - minX + 1), category.maxHeight / (maxY - minY + 1));
      const width = mode === 'natural' ? 158 : mode === 'proposed' ? Math.round((maxX - minX + 1) * scale * 2) : category.width * 2;
      const height = mode === 'natural' ? 158 : mode === 'proposed' ? Math.round((maxY - minY + 1) * scale * 2) : category.height * 2;
      const sprite = await (mode === 'proposed'
        ? sharp(await input.clone().png().toBuffer()).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
        : input.clone()).resize(width, height, { fit: 'fill' }).png().toBuffer();
      const col = index % cols;
      const row = Math.floor(index / cols);
      composites.push({ input: sprite, left: col * 190 + Math.floor((190 - width) / 2), top: row * 205 + 25 + Math.floor((160 - height) / 2) });
      composites.push({ input: tileLabel(gid, tileset.name), left: col * 190, top: row * 205 + 171 });
    }
    const output = path.join(outputDir, `${category.name}-${mode}.png`);
    await sharp({ create: { width: cols * 190, height: rows * 205, channels: 4, background: '#4d4b3e' } })
      .composite(composites).png().toFile(output);
    console.log(output);
  }
}

await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(records, null, 2));
