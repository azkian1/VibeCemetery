import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dir = path.join(process.cwd(), 'artifacts', 'grave-review');
const final = process.argv.includes('--final');
const output = path.join(dir, final ? 'approved-final.json' : 'approved-v1.json');
const selection = JSON.parse(await fs.readFile(path.join(dir, 'review-selection.json'), 'utf8'));
if (final && (selection.accepted.length !== 47 || selection.redo.length !== 0)) {
  throw new Error('Final approval requires all 47 grave models to pass');
}
try {
  await fs.access(output);
  throw new Error(`Approval manifest already exists: ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const files = await fs.readdir(dir);
const accepted = [];
for (const gid of selection.accepted) {
  const filename = files.find(file => file.startsWith(`${gid}_`) && file.endsWith('.png'));
  if (!filename) throw new Error(`Missing accepted grave ${gid}`);
  const sha256 = createHash('sha256').update(await fs.readFile(path.join(dir, filename))).digest('hex');
  accepted.push({ gid, filename, sha256 });
}
await fs.writeFile(output, `${JSON.stringify({
  approvedAt: selection.savedAt,
  accepted,
  redo: selection.redo,
}, null, 2)}\n`);
console.log(`Locked ${accepted.length} approved graves; ${selection.redo.length} require angle correction.`);
