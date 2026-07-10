import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSlotsV2 } from '../src/game/utils/slotManager-v2'

type TmjObject = {
  id: number
  x: number
  y: number
  width: number
  height: number
}

type TmjLayer = {
  name: string
  type: string
  x?: number
  y?: number
  offsetx?: number
  offsety?: number
  objects?: TmjObject[]
}

function loadMap4() {
  const mapPath = join(process.cwd(), 'public', 'map', 'Map4.tmj')
  return JSON.parse(readFileSync(mapPath, 'utf8')) as { layers: TmjLayer[] }
}

function getLayer(map: { layers: TmjLayer[] }, name: string) {
  const layer = map.layers.find((item) => item.name === name)
  expect(layer, `${name} layer`).toBeTruthy()
  return layer!
}

test.describe('map v2 coordinates', () => {
  test('uses real Map4 GraveObj coordinates after the TMJ layer offset is parsed once', () => {
    const map4 = loadMap4()
    const graveLayer = getLayer(map4, 'GraveObj')
    const rawGrave = graveLayer.objects?.find((obj) => obj.id === 10)
    expect(rawGrave).toBeTruthy()

    const map = {
      getObjectLayer(name: string) {
        if (name !== 'GraveObj') return null
        return {
          objects: [
            {
              ...rawGrave!,
              x: rawGrave!.x + (graveLayer.offsetx ?? 0),
              y: rawGrave!.y + (graveLayer.offsety ?? 0),
            },
          ],
        }
      },
    } as unknown as Parameters<typeof parseSlotsV2>[0]

    const slots = parseSlotsV2(map)

    expect(slots.get(10)).toMatchObject({
      id: 10,
      type: 'grave_tall',
      x: 1568,
      y: 2656,
      width: 32,
      height: 64,
    })
  })

  test('keeps Map4 preview offsets numeric for Phaser parsing', () => {
    const map4 = loadMap4()

    expect(getLayer(map4, 'ChapelPreview_8d_lowdetail_palette_copy')).toMatchObject({
      offsetx: -480,
      offsety: 160,
    })
    expect(getLayer(map4, 'GravediggerLodgePreview_map4')).toMatchObject({
      offsetx: -64,
      offsety: -32,
    })
  })

  test('keeps Map4 tile layer positions numeric for Phaser createLayer defaults', () => {
    const map4 = loadMap4()
    const tileLayers = map4.layers.filter((layer) => layer.type === 'tilelayer')

    expect(tileLayers.length).toBeGreaterThan(0)
    for (const layer of tileLayers) {
      expect(typeof layer.x, `${layer.name}.x`).toBe('number')
      expect(typeof layer.y, `${layer.name}.y`).toBe('number')
      if (layer.offsetx !== undefined) {
        expect(typeof layer.offsetx, `${layer.name}.offsetx`).toBe('number')
      }
      if (layer.offsety !== undefined) {
        expect(typeof layer.offsety, `${layer.name}.offsety`).toBe('number')
      }
    }
  })

  test('keeps Map4 rendered layer offsets in their authored coordinate spaces', () => {
    const map4 = loadMap4()

    expect(getLayer(map4, 'pixellab_dualgrid_reconstructed')).toMatchObject({
      x: 0,
      y: 0,
      offsetx: 768,
      offsety: 1312,
    })
    expect(getLayer(map4, 'fog_soft_inner')).toMatchObject({ x: 0, y: 0 })
    expect(getLayer(map4, 'fog_soft_inner').offsetx).toBeUndefined()
    expect(getLayer(map4, 'fog_soft_inner').offsety).toBeUndefined()
    expect(getLayer(map4, 'fog_soft_outer')).toMatchObject({ x: 0, y: 0 })
    expect(getLayer(map4, 'fog_soft_outer').offsetx).toBeUndefined()
    expect(getLayer(map4, 'fog_soft_outer').offsety).toBeUndefined()
    expect(getLayer(map4, 'fog_locked_blockout')).toMatchObject({ x: 0, y: 0 })
    expect(getLayer(map4, 'fog_locked_blockout').offsetx).toBeUndefined()
    expect(getLayer(map4, 'fog_locked_blockout').offsety).toBeUndefined()
    expect(getLayer(map4, 'Buildings')).toMatchObject({ x: 0, y: 0 })
    expect(getLayer(map4, 'Buildings').offsetx).toBeUndefined()
    expect(getLayer(map4, 'Buildings').offsety).toBeUndefined()
  })
})
