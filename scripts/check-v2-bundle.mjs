import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), '.next/static/chunks')
if (!existsSync(root)) throw new Error('Run npm run build before auditing the production client bundle')
const forbidden = ['/storage/v1/object/public/tilesets', '/map/az.tmj', 'Graveyard_B.png', 'graveyard_ground.png']
let checked = 0
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (entry.name.endsWith('.js')) {
      checked++
      const text = readFileSync(path, 'utf8')
      for (const value of forbidden) if (text.includes(value)) throw new Error(`Retired asset dependency in ${path}: ${value}`)
    }
  }
}
visit(root)
if (!checked) throw new Error('No production client chunks found')
console.log(`Audited ${checked} production client chunks: no v1 map or licensed tileset requests. Public/archive retirement is a separate rollout gate.`)
