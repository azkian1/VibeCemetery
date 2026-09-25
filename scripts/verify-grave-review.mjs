import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const reviewDir = path.join(root, 'artifacts', 'grave-review');
const lock = JSON.parse(await fs.readFile(path.join(reviewDir, 'approved-v1.json'), 'utf8'));
const redrawIds = JSON.parse(await fs.readFile(path.join(root, 'src', 'game', 'utils', 'paintedGraveRedrawIdsV2.json'), 'utf8'));
if (JSON.stringify(redrawIds) !== JSON.stringify(lock.redo)) {
  throw new Error('Redraw GIDs differ from the rejected review selection');
}
for (const entry of lock.accepted) {
  const bytes = await fs.readFile(path.join(reviewDir, entry.filename));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256) throw new Error(`Approved GID ${entry.gid} changed`);
}
const sources = path.join(root, 'artifacts', 'painted-map-sources', 'grave-redraws');
for (const gid of redrawIds) await fs.access(path.join(sources, `${gid}.png`));
const final = JSON.parse(await fs.readFile(path.join(reviewDir, 'approved-final.json'), 'utf8'));
if (final.accepted.length !== 47 || final.redo.length !== 0) {
  throw new Error('Final approval does not cover all 47 grave models');
}
for (const entry of final.accepted) {
  const bytes = await fs.readFile(path.join(reviewDir, entry.filename));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256) throw new Error(`Final approved GID ${entry.gid} changed`);
}
console.log(`Verified ${lock.accepted.length} earlier frames and all ${final.accepted.length} final approved frames unchanged.`);
