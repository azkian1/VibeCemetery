import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'artifacts', 'painted-map-sources');
const output = path.join(root, 'public', 'map', 'open-art');
await fs.mkdir(output, { recursive: true });

for (const name of [
  'crypt-template-aligned',
  'crematory-garage-template-aligned',
  'crematory-technical-template-aligned',
]) {
  const result = path.join(output, `${name}.webp`);
  await sharp(path.join(source, `${name}.png`))
    .ensureAlpha()
    .trim({ background: '#00000000', threshold: 12 })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(result);
  console.log(`Built ${path.basename(result)}`);
}
