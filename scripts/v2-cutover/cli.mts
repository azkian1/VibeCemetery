import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createManifest, migrationSql, readSlots, rollbackSql, validateManifest, type Manifest, type Snapshot } from './manifest.ts'

// Offline tooling only. No credentials, network calls or SQL execution.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [command, snapshotPath, manifestOrOutput, ...rest] = process.argv.slice(2)
if (!['plan', 'validate', 'sql'].includes(command) || !snapshotPath || !manifestOrOutput) {
  console.error('Usage (Node 22.18+):\n  npm run cutover -- plan SNAPSHOT PRIVATE_OUTPUT_DIR [--slots=ID,ID]\n  npm run cutover -- validate SNAPSHOT MANIFEST\n  npm run cutover -- sql SNAPSHOT MANIFEST PRIVATE_OUTPUT_DIR [--commit]')
  process.exit(1)
}
const snapshot: Snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const mapText = readFileSync(join(repo, 'public/map/cemetery-v2.tmj'), 'utf8')

function privateOutput(path: string): string {
  const output = resolve(path)
  // Resolve symlinks/junctions before allowing sensitive artifacts to be written.
  mkdirSync(output, { recursive: true })
  const actual = realpathSync(output)
  const rel = relative(realpathSync(repo), actual)
  if (!rel || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel))) {
    throw new Error('Migration artifacts must be stored outside the repository and public directory')
  }
  return actual
}
function save(dir: string, name: string, content: string) {
  writeFileSync(join(dir, name), content, { flag: 'wx', mode: 0o600 })
}

if (command === 'plan') {
  if (rest.some(arg => !arg.startsWith('--slots=')) || rest.length > 1) throw new Error('Unknown plan argument')
  const slots = rest[0]?.slice('--slots='.length).split(',').map(Number)
  const manifest = createManifest(snapshot, mapText, slots)
  const out = privateOutput(manifestOrOutput)
  const catalog = new Map(readSlots(mapText).map(s => [s.id, s]))
  save(out, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  save(out, 'placements.tsv', ['grave_id\told_slot\tnew_slot\ttype\tx\ty\tgid', ...manifest.placements.map(p => {
    const slot = catalog.get(p.new_slot_id)!
    return [p.grave_id, p.old_slot_id, p.new_slot_id, slot.type, slot.x, slot.y, p.new_grave_gid].join('\t')
  })].join('\n') + '\n')
  save(out, 'dry-run.sql', migrationSql(manifest, snapshot, mapText))
  save(out, 'restore-dry-run.sql', rollbackSql(manifest, snapshot, mapText))
  console.log(`Planned ${manifest.placements.length} graves. Review manifest.json and placements.tsv. SQL ends with ROLLBACK.`)
} else {
  const manifest: Manifest = JSON.parse(readFileSync(manifestOrOutput, 'utf8'))
  validateManifest(manifest, snapshot, mapText)
  if (command === 'validate') {
    if (rest.length) throw new Error('Unknown validate argument')
    console.log(`Valid manifest: ${manifest.placements.length} graves; complete UUID coverage and compatible v2 slots/GIDs.`)
  } else {
    const [dir, flag] = rest
    if (!dir || rest.length > 2 || (flag !== undefined && flag !== '--commit')) throw new Error('SQL requires a private output directory and optional --commit')
    const out = privateOutput(dir)
    save(out, flag ? 'apply.sql' : 'dry-run.sql', migrationSql(manifest, snapshot, mapText, flag === '--commit'))
    console.log(flag ? 'Generated apply.sql. No SQL has been executed. Keep the database gate closed through release smoke.' : 'Generated rollback-only dry-run.sql. No SQL has been executed.')
  }
}
