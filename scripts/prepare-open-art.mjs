import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sources = path.join(root, 'artifacts', 'painted-map-sources');
const out = path.join(root, 'public', 'map', 'open-art');
const terrainOnly = process.argv.includes('--terrain-only');
await fs.mkdir(out, { recursive: true });

async function saveWebp(name, { trim = false, removeHalo = false } = {}) {
  let input = sharp(path.join(sources, `${name}.png`)).ensureAlpha();
  if (name.startsWith('grave-atlas-') || name.startsWith('tree-atlas-')) {
    input = input.resize(1254, 1254, { fit: 'fill' });
  }
  if (removeHalo) {
    const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    const isBackdrop = (index) => {
      const p = index * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      return a < 64 || (r > g + 3 && g >= b + 5 && r < 165)
        || (r < 42 && g < 42 && b < 42);
    };
    const visit = (index) => {
      if (visited[index] || !isBackdrop(index)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < width * (height - 1)) visit(index + width);
    }
    for (let i = 0; i < visited.length; i++) {
      if (visited[i]) data[i * 4 + 3] = 0;
    }
    input = sharp(data, { raw: { width, height, channels: 4 } });
  }
  if (trim) input = input.trim({ background: '#00000000', threshold: 12 });
  await input.webp({ quality: 87, alphaQuality: 100, effort: 6 }).toFile(path.join(out, `${name}.webp`));
}

if (!terrainOnly) {
  for (let i = 1; i <= 12; i++) await saveWebp(`grave-atlas-${String(i).padStart(2, '0')}`);
  for (let i = 1; i <= 4; i++) await saveWebp(`tree-atlas-${String(i).padStart(2, '0')}`);
  for (const name of ['grass-texture', 'stone-texture', 'gate-ground-clean']) await saveWebp(name);
  for (const name of ['chapel', 'lodge', 'garage', 'technical', 'side-fence', 'inner-gate']) {
    await saveWebp(name, { trim: true, removeHalo: name === 'chapel' || name === 'technical' });
  }
}
for (const name of ['grass-texture-v2', 'stone-texture-v3']) await saveWebp(name);

// The entrance art is deliberately unchanged inside the gate. Its original
// alpha ramp is only about 30 source pixels wide, which exposes an obvious
// line when a different ground material begins. Fade over a wider margin.
{
  const { data, info } = await sharp(path.join(sources, 'gate-ground-clean.png'))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const fade = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < info.height; y++) {
    const vertical = fade(y / 175) * fade((info.height - 1 - y) / 85);
    for (let x = 0; x < info.width; x++) {
      const horizontal = fade(x / 165) * fade((info.width - 1 - x) / 165);
      const alpha = (y * info.width + x) * 4 + 3;
      data[alpha] = Math.round(data[alpha] * vertical * horizontal);
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 87, alphaQuality: 100, effort: 6 })
    .toFile(path.join(out, 'gate-ground-blend-v2.webp'));
}

// Build one high-detail terrain plate for the existing TMJ footprint. The
// original 16-tile dual-grid supplies the road silhouette. The calmer ground
// surfaces are matched to the first gate concept. Mirrored repeats join at
// identical edge pixels. Empty map cells stay transparent under authored fog.
const map = JSON.parse(await fs.readFile(path.join(root, 'public', 'map', 'cemetery-v2.tmj'), 'utf8'));
const layer = map.layers.find((entry) => entry.name === 'pixellab_dualgrid_reconstructed');
if (!layer?.data || layer.offsetx !== 768 || layer.offsety !== 1312) {
  throw new Error('Unexpected v2 terrain geometry');
}
const { data: sourceTile, info: tileInfo } = await sharp(path.join(root, 'public', 'map', 'tilesets', 'grass_flagstone_spritesheet.png'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const textures = await Promise.all(['grass-texture-v2', 'stone-texture-v3'].map(async (name) => {
  const texture = await sharp(path.join(sources, `${name}.png`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const grass = name === 'grass-texture-v2';
  const sourceMean = grass ? [80, 74, 34] : [110, 110, 110];
  const gateMean = grass ? [94, 88, 42] : [106, 102, 96];
  const contrast = grass ? 0.72 : 0.82;
  // Keep the reference's palette while making individual blades and stone
  // highlights quieter than memorial silhouettes at normal gameplay zoom.
  for (let i = 0; i < texture.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      texture.data[i + channel] = Math.max(0, Math.min(255,
        Math.round(gateMean[channel] + (texture.data[i + channel] - sourceMean[channel]) * contrast)));
    }
  }
  return texture;
}));
const scale = 1.5;
const worldWidth = 2560;
const worldHeight = 2016;
const width = Math.round(worldWidth * scale);
const height = Math.round(worldHeight * scale);
const raw = Buffer.alloc(width * height * 4);
const mirrored = (value, size) => {
  const block = Math.floor(value / size);
  const offset = value % size;
  return block % 2 ? size - 1 - offset : offset;
};
for (let y = 0; y < height; y++) {
  const worldY = y / scale;
  const row = Math.floor(worldY / map.tileheight);
  for (let x = 0; x < width; x++) {
    const worldX = x / scale;
    const col = Math.floor(worldX / map.tilewidth);
    const gid = layer.data[row * layer.width + col];
    if (gid < 11 || gid > 26) continue;
    const tile = gid - 11;
    const px = (tile % 4) * 32 + Math.floor(worldX % 32);
    const py = Math.floor(tile / 4) * 32 + Math.floor(worldY % 32);
    const ti = (py * tileInfo.width + px) * 4;
    const r = sourceTile[ti], g = sourceTile[ti + 1], b = sourceTile[ti + 2];
    const stone = b > 66 && Math.abs(r - g) < 29 && r > 60;
    const texture = textures[stone ? 1 : 0];
    // The old road texture's pavers were larger than the gate prototype's.
    const detailScale = stone ? 2 : 1;
    const tx = mirrored(Math.floor(x * detailScale), texture.info.width);
    const ty = mirrored(Math.floor(y * detailScale), texture.info.height);
    const si = (ty * texture.info.width + tx) * 4;
    const di = (y * width + x) * 4;
    raw[di] = texture.data[si];
    raw[di + 1] = texture.data[si + 1];
    raw[di + 2] = texture.data[si + 2];
    raw[di + 3] = 255;
  }
}
await sharp(raw, { raw: { width, height, channels: 4 } })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(path.join(out, 'terrain-v3.webp'));

console.log(`Prepared ${terrainOnly ? 3 : 28} art assets and ${width}×${height} terrain.`);
