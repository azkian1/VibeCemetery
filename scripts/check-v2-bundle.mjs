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
const retiredRuntime = [
  'src/components/CemeteryApp.tsx', 'src/components/PhaserCanvas.tsx',
  'src/game/config.ts', 'src/game/scenes/CemeteryScene.ts',
  'src/game/utils/slotManager.ts', 'src/game/utils/tileRegistry.ts',
]
for (const path of retiredRuntime) {
  if (existsSync(path)) throw new Error('Retired runtime remains in the checkout: ' + path)
}
const legacyName = /^(?:az\.tmj|(?:Crypt_[BCD]|Graveyard_[ABCD]\d*|graveyard_ground|non-rm-a1-square|[!$]*Fire_Animation)\.(?:png|tsx)|(?:cemetery|Ground1)\.(?:json|tmx)|analyze_v6\.js|tile-categories\.html|CLAUDEMAP\.md)$/i
function auditPublic(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.name.toLowerCase() === 'tailes' || legacyName.test(entry.name)) {
      throw new Error('Retired asset remains publicly deployable: ' + path)
    }
    if (entry.isDirectory()) auditPublic(path)
  }
}
auditPublic(join(process.cwd(), 'public'))
console.log('Audited ' + checked + ' production client chunks, public assets and source retirement: no v1 runtime or licensed tilesets.')
