import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CEMETERY_MAP_V2_FILE } from '../src/lib/map-version'
import { paintMinimapLayer, type MinimapRasterLayer } from '../src/game/utils/minimapRaster'

type TmjLayer = {
  name: string
  width: number
  height: number
  x?: number
  y?: number
  offsetx?: number
  offsety?: number
  data: number[]
}

type TmjMap = {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TmjLayer[]
}

function loadCemeteryMapV2() {
  const mapPath = join(process.cwd(), 'public', 'map', CEMETERY_MAP_V2_FILE)
  return JSON.parse(readFileSync(mapPath, 'utf8')) as TmjMap
}

function toRasterLayer(map: TmjMap, name: string): MinimapRasterLayer {
  const layer = map.layers.find((candidate) => candidate.name === name)
  expect(layer, name + ' layer').toBeTruthy()
  const data = Array.from({ length: layer!.height }, (_, y) =>
    Array.from({ length: layer!.width }, (_, x) => {
      const gid = layer!.data[y * layer!.width + x]
      return { index: gid || -1 }
    }),
  )

  return {
    x: (layer!.x ?? 0) + (layer!.offsetx ?? 0),
    y: (layer!.y ?? 0) + (layer!.offsety ?? 0),
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    width: layer!.width,
    height: layer!.height,
    data,
  }
}

test('v2 minimap terrain applies the Phaser-parsed Tiled layer offset', () => {
  const map = loadCemeteryMapV2()
  const terrain = new Uint8Array(map.width * map.height)

  paintMinimapLayer(
    terrain,
    map.width,
    map.height,
    toRasterLayer(map, 'pixellab_dualgrid_reconstructed'),
    (tile) => tile.index,
  )

  expect(terrain[41 * map.width + 41]).toBe(17)
  expect(terrain[17]).toBe(0)
})

test('v2 minimap represents each authored fog-of-war state', () => {
  const map = loadCemeteryMapV2()
  const fog = new Uint8Array(map.width * map.height)

  paintMinimapLayer(fog, map.width, map.height, toRasterLayer(map, 'fog_soft_inner'), 1)
  paintMinimapLayer(fog, map.width, map.height, toRasterLayer(map, 'fog_soft_outer'), 2)
  paintMinimapLayer(fog, map.width, map.height, toRasterLayer(map, 'fog_locked_blockout'), 3)

  expect(fog[38 * map.width + 61]).toBe(3)
  expect(fog[41 * map.width + 61]).toBe(2)
  expect(fog[42 * map.width + 61]).toBe(1)
  expect(fog[43 * map.width + 61]).toBe(0)

  expect(fog.filter((state) => state === 3)).toHaveLength(11879)
  expect(fog.filter((state) => state === 2)).toHaveLength(213)
  expect(fog.filter((state) => state === 1)).toHaveLength(245)
  expect(fog.filter((state) => state === 0)).toHaveLength(2223)
})
