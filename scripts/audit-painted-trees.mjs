import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const map = JSON.parse(await fs.readFile(path.join(root, 'public/map/cemetery-v2.tmj'), 'utf8'));
const treeLayer = map.layers.find((layer) => layer.name === 'TreeObj');
const treeObjects = treeLayer?.objects.filter((object) => object.gid).map((object) => ({
  ...object, x: object.x + treeLayer.offsetx, y: object.y + treeLayer.offsety,
})) ?? [];
const slotSource = await fs.readFile(path.join(root, 'src/lib/map-layout-v2.ts'), 'utf8');
const activeIds = new Set(slotSource.match(/ACTIVE_GRAVE_SLOT_IDS_V2[^=]*= Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1].match(/\d+/g).map(Number));
const graveLayer = map.layers.find((layer) => layer.name === 'GraveObj');
const graveSlots = graveLayer?.objects.filter((object) => activeIds.has(object.id)).map((object) => ({
  ...object, x: object.x + graveLayer.offsetx, y: object.y + graveLayer.offsety,
})) ?? [];
const terrain = await sharp(path.join(root, 'public/map/open-art/terrain-v5.webp'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const treeRootInset = { 35: 22, 36: 18, 37: 13, 38: 5, 39: 6, 40: 9, 41: 3, 42: 11, 43: 15,
  44: 14, 45: 8, 46: 10, 47: 12, 48: 9, 49: 11, 50: 13 };
const isStone = (r, g, b) => b > 68 && r > 91 && Math.abs(r - g) < 29 && b >= g - 24;

for (let gid = 35; gid <= 50; gid++) {
  const atlas = String(Math.floor((gid - 35) / 4) + 1).padStart(2, '0');
  const frame = (gid - 35) % 4;
  const { data } = await sharp(path.join(root, `public/map/open-art/tree-atlas-cybergothic-v2-${atlas}.webp`))
    .extract({ left: (frame % 2) * 627, top: Math.floor(frame / 2) * 627, width: 627, height: 627 })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = 627, top = 627, right = -1, bottom = -1;
  for (let y = 0; y < 627; y++) {
    for (let x = 0; x < 627; x++) {
      if (data[(y * 627 + x) * 4 + 3] < 40) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  const objects = treeObjects.filter((object) => object.gid === gid);
  const bounds = right >= left ? `${right - left + 1}x${bottom - top + 1}` : 'empty';
  console.log(`GID ${gid}: ${objects.length} placements; visible sprite ${bounds}; native ratio ${((right - left + 1) / (bottom - top + 1)).toFixed(2)}; Tiled ${objects[0]?.width ?? '-'}x${objects[0]?.height ?? '-'}`);
}

const onRoad = [];
for (const object of treeObjects) {
  const rootX = object.x + object.width / 2;
  const rootY = object.y - (treeRootInset[object.gid] ?? 0);
  if (graveSlots.some((slot) => rootX >= slot.x - 6 && rootX <= slot.x + slot.width + 6
    && rootY >= slot.y - 6 && rootY <= slot.y + slot.height + 6)) continue;
  const imageX = Math.round((rootX - 768) * 1.5);
  const imageY = Math.round((rootY - 1312) * 1.5);
  if (imageX < 20 || imageY < 20 || imageX >= terrain.info.width - 20 || imageY >= terrain.info.height - 20) continue;
  let stone = 0, valid = 0;
  for (let dy = -15; dy <= 15; dy += 3) {
    for (let dx = -15; dx <= 15; dx += 3) {
      const index = ((imageY + dy) * terrain.info.width + imageX + dx) * 4;
      if (terrain.data[index + 3] < 200) continue;
      valid++;
      stone += Number(isStone(terrain.data[index], terrain.data[index + 1], terrain.data[index + 2]));
    }
  }
  const fraction = valid ? stone / valid : 0;
  if (fraction > 0.35) onRoad.push({ id: object.id, gid: object.gid, x: rootX, y: rootY, stoneFraction: +fraction.toFixed(2) });
}
console.log('Tree roots on or close to stone:', onRoad);
if (onRoad.length) process.exitCode = 1;

for (const roadTree of process.argv.includes('--suggest')
  ? treeObjects.filter((object) => [404, 410, 431].includes(object.id)) : []) {
  const originalX = roadTree.x + roadTree.width / 2;
  const originalY = roadTree.y - treeRootInset[roadTree.gid];
  const candidates = [];
  for (let dy = -96; dy <= 96; dy += 8) {
    for (let dx = -96; dx <= 96; dx += 8) {
      const distance = Math.hypot(dx, dy);
      if (distance < 24) continue;
      const x = originalX + dx;
      const y = originalY + dy;
      if (graveSlots.some((slot) => x >= slot.x - 6 && x <= slot.x + slot.width + 6
        && y >= slot.y - 6 && y <= slot.y + slot.height + 6)) continue;
      const imageX = Math.round((x - 768) * 1.5);
      const imageY = Math.round((y - 1312) * 1.5);
      if (imageX < 20 || imageY < 20 || imageX >= terrain.info.width - 20 || imageY >= terrain.info.height - 20) continue;
      let stone = 0, valid = 0;
      for (let py = -15; py <= 15; py += 3) {
        for (let px = -15; px <= 15; px += 3) {
          const index = ((imageY + py) * terrain.info.width + imageX + px) * 4;
          if (terrain.data[index + 3] < 200) continue;
          valid++;
          stone += Number(isStone(terrain.data[index], terrain.data[index + 1], terrain.data[index + 2]));
        }
      }
      const fraction = valid ? stone / valid : 1;
      if (fraction > 0.08) continue;
      if (treeObjects.some((object) => object.id !== roadTree.id
        && Math.hypot(x - object.x - object.width / 2,
          y - object.y + (treeRootInset[object.gid] ?? 0)) < 56)) continue;
      candidates.push({ dx, dy, x, y, distance: +distance.toFixed(1), stone: +fraction.toFixed(2) });
    }
  }
  console.log(`Nearest grass candidates for tree ${roadTree.id}:`);
  console.log(candidates.sort((a, b) => a.distance - b.distance).slice(0, 12));
}
