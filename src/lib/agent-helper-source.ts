import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export async function readAgentHelper() {
  const source = await readFile(join(process.cwd(), 'SKILL/skills/bury-workflow/scripts/bury-helper.mjs'), 'utf8')
  return { source, sha256: createHash('sha256').update(source).digest('hex') }
}
