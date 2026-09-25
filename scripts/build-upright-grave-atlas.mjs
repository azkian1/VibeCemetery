import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// The two original wide memorials were painted almost from directly above.
// Keep the other two frames in atlas 07 and replace only GIDs 77 and 78.
const sources = path.join(process.cwd(), 'artifacts', 'painted-map-sources');
const atlasPath = path.join(sources, 'grave-atlas-07.png');
const frames = [];
for (let frame = 0; frame < 4; frame++) {
  const input = frame < 2
    ? sharp(atlasPath).extract({ left: frame * 627, top: 0, width: 627, height: 627 })
    : sharp(path.join(sources, `grave-${frame + 75}-upright.png`))
      .resize(627, 627, { fit: 'contain', background: '#00000000' });
  frames.push({
    input: await input.ensureAlpha().png().toBuffer(),
    left: (frame % 2) * 627,
    top: Math.floor(frame / 2) * 627,
  });
}
const atlas = await sharp({
  create: { width: 1254, height: 1254, channels: 4, background: '#00000000' },
}).composite(frames).png().toBuffer();
await fs.writeFile(atlasPath, atlas);
console.log('Updated grave atlas 07 with upright keyboard and GPU memorials.');
