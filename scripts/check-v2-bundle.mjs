import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { execFileSync } from 'node:child_process'

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
const retiredDocs = new Set(['PATCH.md', 'LEVEL_DESIGN_RULES.md', 'CLAUDEMAP.md'])
const legacyName = /^(?:az\.tmj|(?:Crypt_[BCD]|Graveyard_[ABCD]\d*|graveyard_ground|non-rm-a1-square|[!$]*Fire_Animation)\.(?:png|tsx)|(?:cemetery|Ground1)\.(?:json|tmx)|analyze_v6\.js|tile-categories\.html|CLAUDEMAP\.md)$/i
function auditPublic(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.name.toLowerCase() === 'tailes' || retiredDocs.has(entry.name) || legacyName.test(entry.name)) {
      throw new Error('Retired asset remains publicly deployable: ' + path)
    }
    if (entry.isDirectory()) auditPublic(path)
  }
}
auditPublic(join(process.cwd(), 'public'))
const trackedPaths = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0'))
const mapImages = new Set()
function collectMapImages(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' && typeof child === 'string') mapImages.add(child)
    else collectMapImages(child)
  }
}
collectMapImages(JSON.parse(readFileSync('public/map/cemetery-v2.tmj', 'utf8')))
for (const image of mapImages) {
  // Tiled authoring SVGs have committed PNG equivalents used by Phaser.
  const file = posix.normalize('public/map/' + image.replace(/\.svg$/i, '.png'))
  if (!file.startsWith('public/map/') || !trackedPaths.has(file) || !existsSync(file)) {
    throw new Error('Required map image is missing from Git: ' + file)
  }
}
if (existsSync('screenshots/Screen.png')) throw new Error('Retired map screenshot remains in the checkout')
const docPatterns = [
  /\/cemetery\/v1\b/i, /\baz\.tmj\b/i,
  /\b(?:Crypt_[BCD]|Graveyard_[ABCD]\d*|graveyard_ground|non-rm-a1-square|Fire_Animation)\.(?:png|tsx)\b/i,
  /\b(?:map|maps|cemetery|tilesets?|runtime)\s+v1\b|\bv1\s+(?:map|maps|cemetery|tilesets?|runtime)\b/i,
  /\b(?:both|two)[ -]maps?\b/i,
  /\b(?:CemeteryApp|PhaserCanvas|CemeteryScene)\.tsx?\b/,
]
const documentPaths = new Set()
// Git determines published repository docs; private untracked drafts are not publication input.
for (const file of trackedPaths) {
  if (/\.(?:md|mdx|txt|html)$/i.test(file) && existsSync(file)) documentPaths.add(file)
}
function collectPublicDocs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) collectPublicDocs(path)
    else if (/\.(?:md|mdx|txt|html)$/i.test(path)) documentPaths.add(path)
  }
}
collectPublicDocs(join(process.cwd(), 'public'))
for (const file of documentPaths) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (docPatterns.some(pattern => pattern.test(lines[index]))) throw new Error('Retired map reference in public documentation: ' + file + ':' + (index + 1))
  }
}
console.log('Audited ' + checked + ' production client chunks, ' + mapImages.size + ' committed map images, public assets, ' + documentPaths.size + ' documentation files and source retirement: no retired map references.')
