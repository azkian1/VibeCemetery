import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { ACTIVE_GRAVE_SLOT_IDS_V2 } from '../src/lib/map-layout-v2'
import { GRAVE_GIDS_V2 } from '../src/game/utils/tileRegistry-v2'
import {
  paintedGraveFrameV2,
  paintedGraveSizeV2,
  paintedTreeFrameV2,
} from '../src/game/utils/paintedArtV2'

const root = process.cwd()
const map = JSON.parse(readFileSync(join(root, 'public/map/cemetery-v2.tmj'), 'utf8'))
const graveLayer = map.layers.find((layer: { name: string }) => layer.name === 'GraveObj')
const artDir = join(root, 'public/map/open-art')

function slotType(width: number, height: number) {
  if (width === 32 && height === 64) return 'grave_tall'
  if (width === 64 && height === 32) return 'grave_wide'
  if (width === 64 && height === 64) return 'grave_large'
  throw new Error(`Unknown slot footprint ${width}×${height}`)
}

test('local all-graves preview covers every approved slot and every grave GID', async () => {
  const slots = graveLayer.objects as Array<{ id: number; width: number; height: number }>
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
    expect(existsSync(join(artDir, `grave-atlas-${frame!.key.slice(-2)}.webp`))).toBe(true)
    const size = paintedGraveSizeV2(type)
    expect(size.width).toBeLessThanOrEqual(slot.width + 12)
    expect(size.height).toBeLessThanOrEqual(slot.height + 12)
  }
  expect([...used].sort((a, b) => a - b)).toEqual(
    Object.values(GRAVE_GIDS_V2).flat().sort((a, b) => a - b),
  )
  for (let number = 1; number <= 12; number++) {
    const name = `grave-atlas-${String(number).padStart(2, '0')}.webp`
    const metadata = await sharp(join(artDir, name)).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 1254, true])
  }
})

test('all authored tree variants use complete transparent sprites', async () => {
  for (let gid = 35; gid <= 50; gid++) {
    const frame = paintedTreeFrameV2(gid)
    expect(frame, `tree GID ${gid}`).not.toBeNull()
    expect(existsSync(join(artDir, `tree-atlas-${frame!.key.slice(-2)}.webp`))).toBe(true)
  }
  for (let number = 1; number <= 4; number++) {
    const name = `tree-atlas-${String(number).padStart(2, '0')}.webp`
    const metadata = await sharp(join(artDir, name)).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1254, 1254, true])
  }
})
