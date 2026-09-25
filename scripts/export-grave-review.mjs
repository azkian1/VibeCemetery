import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const map = JSON.parse(await fs.readFile(path.join(root, 'public', 'map', 'cemetery-v2.tmj'), 'utf8'));
const artDir = path.join(root, 'public', 'map', 'open-art');
const reviewDir = path.join(root, 'artifacts', 'grave-review');
const redrawIds = new Set(JSON.parse(await fs.readFile(path.join(root, 'src', 'game', 'utils', 'paintedGraveRedrawIdsV2.json'), 'utf8')));
await fs.mkdir(reviewDir, { recursive: true });
const overviews = path.join(root, 'artifacts', 'visual-audits', 'graves');
for (const type of ['tall', 'wide', 'large']) {
  await fs.copyFile(path.join(overviews, `${type}-proposed.png`),
    path.join(reviewDir, `overview-${type}.png`));
}

const rows = [];
for (let gid = 51; gid <= 97; gid++) {
  const index = gid - 51;
  const atlas = String(Math.floor(index / 4) + 1).padStart(2, '0');
  const frame = index % 4;
  const name = map.tilesets.find(tileset => tileset.firstgid === gid)?.name;
  if (!name) throw new Error(`No source name for grave GID ${gid}`);
  const type = gid <= 76 ? 'tall' : gid <= 85 ? 'wide' : 'large';
  const filename = `${gid}_${type}_${name}.png`;
  const asset = redrawIds.has(gid) ? `grave-redraw-atlas-${atlas}.webp` : `grave-atlas-${atlas}.webp`;
  await sharp(path.join(artDir, asset))
    .extract({ left: (frame % 2) * 627, top: Math.floor(frame / 2) * 627,
      width: 627, height: 627 })
    .png().toFile(path.join(reviewDir, filename));
  rows.push(`| ${gid} | [${filename}](./${filename}) | ${redrawIds.has(gid) ? 'Развёрнут фасадом' : 'Одобрено'} |  |`);
}

const contents = [
  '# Ревью надгробий',
  '',
  'Здесь 47 отдельных PNG, извлечённых из тех атласов, которые сейчас загружает карта. Номер GID в начале имени файла соответствует модели в игре.',
  '',
  'В последней колонке поставьте `OK` или `Переделать` и, если нужно, короткий комментарий. Можно также просто сообщить номера GID в чате.',
  '',
  'Обзоры в игровом масштабе: [высокие](./overview-tall.png), [широкие](./overview-wide.png), [крупные](./overview-large.png).',
  '',
  '24 одобренные модели остались без изменений. У 23 отклонённых исправлен ракурс фасада и основания.',
  '',
  '| GID | Модель | Изменение | Ваша оценка |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
].join('\n');
await fs.writeFile(path.join(reviewDir, 'REVIEW.md'), contents);
console.log(`Exported ${rows.length} grave PNGs to ${reviewDir}`);
