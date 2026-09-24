import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// One source of truth for every visible grass and road pixel: the cleaned
// ground plate from the first gate prototype. No independently generated
// grass or paving texture is used by this build.
const root = process.cwd();
const sourcePath = path.join(root, 'artifacts', 'painted-map-sources', 'gate-ground-clean.png');
const outputPath = path.join(root, 'public', 'map', 'open-art', 'terrain-v5.webp');
const { data: source, info: sourceInfo } = await sharp(sourcePath)
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let seed = 0x51a7e7;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const smoothstep = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const isStone = (r, g, b) => b > 68 && r > 91 && Math.abs(r - g) < 29 && b >= g - 24;
const isAuthoredRoad = (r, g, b) => b > 66 && Math.abs(r - g) < 29 && r > 60;

function collectPatches(size, regions, wantedStone) {
  const candidates = [];
  for (const region of regions) {
    for (let y = region.y; y + size <= region.y + region.height; y += 16) {
      for (let x = region.x; x + size <= region.x + region.width; x += 16) {
        let stoneCount = 0;
        let opaqueCount = 0;
        let total = 0;
        for (let py = 4; py < size; py += 8) {
          for (let px = 4; px < size; px += 8) {
            const index = ((y + py) * sourceInfo.width + x + px) * 4;
            stoneCount += Number(isStone(source[index], source[index + 1], source[index + 2]));
            opaqueCount += Number(source[index + 3] > 244);
            total++;
          }
        }
        const coverage = stoneCount / total;
        if (opaqueCount / total < 0.99) continue;
        if (wantedStone ? coverage > 0.76 : coverage < 0.08) candidates.push({ x, y });
      }
    }
  }
  if (candidates.length < 12) throw new Error(`Too few ${wantedStone ? 'stone' : 'grass'} prototype patches: ${candidates.length}`);
  return candidates;
}

function quiltMaterial({ width, height, patchSize, overlap, candidates }) {
  const atlas = Buffer.alloc(width * height * 4);
  const step = patchSize - overlap;
  const sourcePixel = (candidate, px, py, flipX, flipY) => {
    const sx = candidate.x + (flipX ? patchSize - 1 - px : px);
    const sy = candidate.y + (flipY ? patchSize - 1 - py : py);
    return (sy * sourceInfo.width + sx) * 4;
  };
  const costAt = (atlasX, atlasY, sourceIndex) => {
    const targetIndex = (atlasY * width + atlasX) * 4;
    const dr = atlas[targetIndex] - source[sourceIndex];
    const dg = atlas[targetIndex + 1] - source[sourceIndex + 1];
    const db = atlas[targetIndex + 2] - source[sourceIndex + 2];
    return dr * dr + dg * dg + db * db;
  };
  const seam = (length, breadth, pixelCost) => {
    const scores = new Float64Array(length * breadth);
    const previous = new Uint8Array(length * breadth);
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < breadth; col++) {
        const index = row * breadth + col;
        const own = pixelCost(row, col);
        if (row === 0) { scores[index] = own; continue; }
        let best = col;
        for (let neighbor = Math.max(0, col - 1); neighbor <= Math.min(breadth - 1, col + 1); neighbor++) {
          if (scores[(row - 1) * breadth + neighbor] < scores[(row - 1) * breadth + best]) best = neighbor;
        }
        scores[index] = own + scores[(row - 1) * breadth + best];
        previous[index] = best;
      }
    }
    let best = 0;
    for (let col = 1; col < breadth; col++) {
      if (scores[(length - 1) * breadth + col] < scores[(length - 1) * breadth + best]) best = col;
    }
    const route = new Uint8Array(length);
    for (let row = length - 1; row >= 0; row--) {
      route[row] = best;
      best = previous[row * breadth + best];
    }
    return route;
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const patchWidth = Math.min(patchSize, width - x);
      const patchHeight = Math.min(patchSize, height - y);
      const left = x ? overlap : 0;
      const top = y ? overlap : 0;
      let choice;
      let lowestCost = Infinity;
      for (let trial = 0; trial < 10; trial++) {
        const candidate = candidates[Math.floor(random() * candidates.length)];
        const flipX = random() < 0.5;
        const flipY = random() < 0.5;
        let cost = 0;
        if (left) {
          for (let py = 0; py < patchHeight; py += 4) {
            for (let px = 0; px < left; px += 4) {
              cost += costAt(x + px, y + py, sourcePixel(candidate, px, py, flipX, flipY));
            }
          }
        }
        if (top) {
          for (let py = 0; py < top; py += 4) {
            for (let px = left; px < patchWidth; px += 4) {
              cost += costAt(x + px, y + py, sourcePixel(candidate, px, py, flipX, flipY));
            }
          }
        }
        if (cost < lowestCost) { lowestCost = cost; choice = { candidate, flipX, flipY }; }
      }
      const { candidate, flipX, flipY } = choice;
      const leftSeam = left ? seam(patchHeight, left, (py, px) =>
        costAt(x + px, y + py, sourcePixel(candidate, px, py, flipX, flipY))) : null;
      const topSeam = top ? seam(patchWidth, top, (px, py) =>
        costAt(x + px, y + py, sourcePixel(candidate, px, py, flipX, flipY))) : null;
      for (let py = 0; py < patchHeight; py++) {
        for (let px = 0; px < patchWidth; px++) {
          if (leftSeam && px < leftSeam[py]) continue;
          if (topSeam && py < topSeam[px]) continue;
          const from = sourcePixel(candidate, px, py, flipX, flipY);
          const to = ((y + py) * width + x + px) * 4;
          atlas[to] = source[from];
          atlas[to + 1] = source[from + 1];
          atlas[to + 2] = source[from + 2];
          atlas[to + 3] = 255;
        }
      }
    }
  }
  return atlas;
}

const width = 3840;
const height = 3024;
const grassPatches = collectPatches(256, [
  { x: 85, y: 255, width: 545, height: 505 },
  { x: 1055, y: 240, width: 515, height: 510 },
], false);
const stonePatches = collectPatches(192, [
  { x: 315, y: 25, width: 1060, height: 255 },
  { x: 655, y: 145, width: 405, height: 490 },
], true);
console.log(`First-prototype material patches: ${grassPatches.length} grass, ${stonePatches.length} road`);
const grass = quiltMaterial({ width, height, patchSize: 256, overlap: 48, candidates: grassPatches });
const road = quiltMaterial({ width, height, patchSize: 192, overlap: 32, candidates: stonePatches });

const map = JSON.parse(await fs.readFile(path.join(root, 'public', 'map', 'cemetery-v2.tmj'), 'utf8'));
const layer = map.layers.find((entry) => entry.name === 'pixellab_dualgrid_reconstructed');
if (!layer?.data || layer.offsetx !== 768 || layer.offsety !== 1312) throw new Error('Unexpected v2 terrain geometry');
const { data: tilePixels, info: tileInfo } = await sharp(path.join(root, 'public', 'map', 'tilesets', 'grass_flagstone_spritesheet.png'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const scale = 1.5;
const terrain = Buffer.alloc(width * height * 4);
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
    const tileIndex = (py * tileInfo.width + px) * 4;
    const material = isAuthoredRoad(tilePixels[tileIndex], tilePixels[tileIndex + 1], tilePixels[tileIndex + 2]) ? road : grass;
    const from = (y * width + x) * 4;
    const to = (y * width + x) * 4;
    terrain[to] = material[from];
    terrain[to + 1] = material[from + 1];
    terrain[to + 2] = material[from + 2];
    terrain[to + 3] = 255;
  }
}

// Incorporate the first prototype's actual ground into this one terrain image.
// Its brushwork now continues into the quilted road and grass rather than
// being rendered as a second runtime layer.
const entrance = { x: 1210, y: 2620, width: 1100, height: 619 };
const entranceWidth = Math.round(entrance.width * scale);
const entranceHeight = Math.round(entrance.height * scale);
const { data: gate } = await sharp(sourcePath).resize(entranceWidth, entranceHeight)
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const gateX = Math.round((entrance.x - layer.offsetx) * scale);
const gateY = Math.round((entrance.y - layer.offsety) * scale);
for (let py = 0; py < entranceHeight; py++) {
  const y = gateY + py;
  if (y < 0 || y >= height) continue;
  const vertical = smoothstep(py / 165) * smoothstep((entranceHeight - 1 - py) / 80);
  for (let px = 0; px < entranceWidth; px++) {
    const x = gateX + px;
    if (x < 0 || x >= width) continue;
    const horizontal = smoothstep(px / 155) * smoothstep((entranceWidth - 1 - px) / 155);
    const from = (py * entranceWidth + px) * 4;
    const to = (y * width + x) * 4;
    const foreAlpha = gate[from + 3] / 255 * vertical * horizontal;
    if (foreAlpha <= 0) continue;
    const backAlpha = terrain[to + 3] / 255;
    const alpha = foreAlpha + backAlpha * (1 - foreAlpha);
    for (let channel = 0; channel < 3; channel++) {
      terrain[to + channel] = Math.round((gate[from + channel] * foreAlpha
        + terrain[to + channel] * backAlpha * (1 - foreAlpha)) / alpha);
    }
    terrain[to + 3] = Math.round(alpha * 255);
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(terrain, { raw: { width, height, channels: 4 } })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(outputPath);
console.log(`Built ${width}×${height} unified ground from the first gate prototype`);
