import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import graveBounds from '../src/game/utils/paintedGraveBoundsV2.json'
import graveRedrawIds from '../src/game/utils/paintedGraveRedrawIdsV2.json'
import { ACTIVE_GRAVE_SLOT_IDS_V2 } from '../src/lib/map-layout-v2'
import { displayGraveGidV2, GRAVE_GIDS_V2 } from '../src/game/utils/tileRegistry-v2'
import {
  paintedGraveFrameV2,
  paintedGraveHeightScaleV2,
  paintedGravePlacementV2,
  paintedGraveSizeV2,
  paintedHighCyberTreeFrameV2,
  paintedTreeFrameV2,
  selectHighCyberTreeIdsV2,
} from '../src/game/utils/paintedArtV2'

const root = process.cwd()
const map = JSON.parse(readFileSync(join(root, 'public/map/cemetery-v2.tmj'), 'utf8'))
const graveLayer = map.layers.find((layer: { name: string }) => layer.name === 'GraveObj')
const innerLayer = map.layers.find((layer: { name: string }) => layer.name === 'Inner')
const artDir = join(root, 'public/map/open-art')

function slotType(width: number, height: number) {
  if (width === 32 && height === 64) return 'grave_tall'
  if (width === 64 && height === 32) return 'grave_wide'
  if (width === 64 && height === 64) return 'grave_large'
  throw new Error(`Unknown slot footprint ${width}×${height}`)
}

test('local all-graves preview covers every approved slot and every grave GID', async () => {
  const slots = graveLayer.objects as Array<{ id: number; x: number; y: number; width: number; height: number }>
  expect(slots.map((slot) => slot.id).sort((a, b) => a - b)).toEqual(
    [...ACTIVE_GRAVE_SLOT_IDS_V2].sort((a, b) => a - b),
  )
  const used = new Set<number>()
  const ordinal = new Map<string, number>()
  for (const slot of [...slots].sort((a, b) => a.id - b.id)) {
    const type = slotType(slot.width, slot.height)
    const variants = GRAVE_GIDS_V2[type]
    const index = ordinal.get(type) ?? 0
    ordinal.set(type, index + 1)
    const gid = variants[index % variants.length]
    used.add(gid)
    const frame = paintedGraveFrameV2(gid)
    expect(frame, `GID ${gid}`).not.toBeNull()
    const asset = graveRedrawIds.includes(gid)
      ? `grave-redraw-atlas-${frame!.key.slice(-2)}.webp`
      : `grave-atlas-${frame!.key.slice(-2)}.webp`
    expect(existsSync(join(artDir, asset))).toBe(true)
    const size = paintedGraveSizeV2(type)
    expect(size.width).toBeLessThanOrEqual(slot.width + 12)
    const placement = paintedGravePlacementV2(gid, type, slot)
    expect(placement).not.toBeNull()
    expect(placement!.visibleWidth).toBeLessThanOrEqual(size.width + 0.001)
    expect(placement!.visibleHeight).toBeLessThanOrEqual(size.height + 0.001)
    expect(placement!.displaySize).toBeGreaterThan(0)
    const bounds = graveBounds[gid - 51]
    const scale = placement!.displaySize / 627
    const heightScale = paintedGraveHeightScaleV2(gid)
    expect(placement!.displayHeight / placement!.displaySize).toBeCloseTo(heightScale, 5)
    expect(placement!.visibleWidth / placement!.visibleHeight)
      .toBeCloseTo(bounds.width / (bounds.height * heightScale), 5)
    expect(placement!.x + (bounds.x + bounds.width / 2 - 627 / 2) * scale)
      .toBeCloseTo(slot.x + slot.width / 2, 5)
    expect(placement!.y + (bounds.y + bounds.height - 627 / 2) * scale * heightScale)
      .toBeCloseTo(slot.y + slot.height + 2, 5)
  }
  expect([...used].sort((a, b) => a - b)).toEqual(
    [...new Set(Object.values(GRAVE_GIDS_V2).flat())].sort((a, b) => a - b),
  )
  expect(used.has(76)).toBe(false)
  expect(displayGraveGidV2(76)).toBe(75)
  for (let number = 1; number <= 12; number++) {
    const name = `grave-atlas-${String(number).padStart(2, '0')}.webp`
    const metadata = await sharp(join(artDir, name)).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 1254, true])
  }
  const redrawAtlases = new Set(graveRedrawIds.map((gid) => Math.floor((gid - 51) / 4) + 1))
  for (const number of redrawAtlases) {
    const name = `grave-redraw-atlas-${String(number).padStart(2, '0')}.webp`
    const metadata = await sharp(join(artDir, name)).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 1254, true])
  }
})

test('grave art has clear space around every plot and leaves the entrance path open', () => {
  const slots = graveLayer.objects as Array<{ id: number; x: number; y: number; width: number; height: number }>
  const envelopes = slots.map(slot => {
    const type = slotType(slot.width, slot.height)
    const sizes = GRAVE_GIDS_V2[type].map(gid => paintedGravePlacementV2(gid, type, slot)!)
    const width = Math.max(...sizes.map(size => size.visibleWidth))
    const height = Math.max(...sizes.map(size => size.visibleHeight))
    const centerX = slot.x + graveLayer.offsetx + slot.width / 2
    const bottom = slot.y + graveLayer.offsety + slot.height + 2
    expect(
      centerX >= 1664 && centerX <= 1808 && bottom >= 2384 && bottom <= 3010,
      `Slot ${slot.id} is on the main path`,
    ).toBe(false)
    return { id: slot.id, left: centerX - width / 2, right: centerX + width / 2,
      top: bottom - height, bottom }
  })
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      const a = envelopes[i], b = envelopes[j]
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      expect(width <= 0 || height <= 0, `Grave slots ${a.id} and ${b.id} overlap`).toBe(true)
    }
  }
})

test('grave slots and editor objects share the coordinates used by modal focus', () => {
  const innerById = new Map((innerLayer.objects as Array<{
    id: number; x: number; y: number; width: number; height: number
  }>).map(object => [object.id, object]))
  expect(innerById.size).toBe(graveLayer.objects.length)
  for (const slot of graveLayer.objects as Array<{
    id: number; x: number; y: number; width: number; height: number
  }>) {
    const inner = innerById.get(slot.id)
    expect(inner, `Missing editor object for grave slot ${slot.id}`).toBeDefined()
    expect([inner!.x, inner!.y, inner!.width, inner!.height]).toEqual([
      slot.x + graveLayer.offsetx,
      slot.y + graveLayer.offsety,
      slot.width,
      slot.height,
    ])
  }
})

test('all authored tree variants use complete transparent sprites', async () => {
  for (let gid = 35; gid <= 50; gid++) {
    const frame = paintedTreeFrameV2(gid)
    expect(frame, `tree GID ${gid}`).not.toBeNull()
    expect(existsSync(join(artDir, `tree-atlas-cybergothic-v2-${frame!.key.slice(-2)}.webp`))).toBe(true)
  }
  for (let number = 1; number <= 4; number++) {
    const name = `tree-atlas-cybergothic-v2-${String(number).padStart(2, '0')}.webp`
    const metadata = await sharp(join(artDir, name)).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 1254, true])
  }
})

test('high-cyber trees occupy one third of distinct positions for both approved species', async () => {
  expect(paintedHighCyberTreeFrameV2(39)).toEqual({ key: 'painted-trees-high-cyber', frame: 0 })
  expect(paintedHighCyberTreeFrameV2(46)).toEqual({ key: 'painted-trees-high-cyber', frame: 1 })
  expect(paintedHighCyberTreeFrameV2(42)).toBeNull()

  const treeLayer = map.layers.find((layer: { name: string }) => layer.name === 'TreeObj')
  const placements = treeLayer.objects as Array<{ id: number; gid: number; x: number; y: number }>
  const selected = selectHighCyberTreeIdsV2(placements)
  for (const gid of [39, 46]) {
    const byPosition = new Map<string, number[]>()
    for (const tree of placements.filter(tree => tree.gid === gid)) {
      const key = `${tree.x}:${tree.y}`
      byPosition.set(key, [...(byPosition.get(key) ?? []), tree.id])
    }
    const cyberPositions = [...byPosition.values()].filter(ids => ids.some(id => selected.has(id)))
    expect(cyberPositions).toHaveLength(Math.round(byPosition.size / 3))
    for (const ids of byPosition.values()) {
      expect(new Set(ids.map(id => selected.has(id))).size).toBe(1)
    }
  }

  const atlas = join(artDir, 'tree-atlas-high-cyber-80.webp')
  const metadata = await sharp(atlas).metadata()
  expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 627, true])
  for (const frame of [0, 1]) {
    const stats = await sharp(atlas).extract({
      left: frame * 627, top: 0, width: 627, height: 627,
    }).stats()
    expect(stats.channels[3].max).toBeGreaterThan(200)
  }
})

test('Crypt and both Crematory wings retain their authored dimensions', async () => {
  const crypt = map.layers.find((layer: { name: string }) =>
    layer.name === 'ChapelPreview_8d_lowdetail_palette_copy').objects[0]
  const lodge = map.layers.find((layer: { name: string }) =>
    layer.name === 'GravediggerLodgePreview_map4').objects[0]
  const service = map.layers.find((layer: { name: string }) =>
    layer.name === 'ServiceBuildingsPreview_map4').objects as Array<{
      name: string; x: number; y: number; width: number; height: number
    }>
  expect([crypt.width, crypt.height]).toEqual([160, 256])
  expect([lodge.width, lodge.height]).toEqual([160, 160])
  expect(service.map(part => [part.name, part.width, part.height])).toEqual([
    ['service_garage_2x3_map4', 64, 96],
    ['service_technical_building_4x5_map4', 128, 160],
  ])

  for (const name of [
    'crypt-template-aligned',
    'crematory-garage-template-aligned',
    'crematory-technical-template-aligned',
  ]) {
    const metadata = await sharp(join(artDir, `${name}.webp`)).metadata()
    expect(metadata.hasAlpha).toBe(true)
    expect(metadata.width).toBeGreaterThan(640)
    expect(metadata.height).toBeGreaterThan(640)
  }
})
