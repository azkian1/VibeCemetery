import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSlotsV2 } from '../src/game/utils/slotManager-v2'
import { getTiledObjectBounds, getTiledObjectCenter } from '../src/game/utils/tiledObject'

type TmjObject = {
  id: number
  name?: string
  gid?: number
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
  visible?: boolean
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

function createPhaserParsedMap(map: { layers: TmjLayer[] }) {
  return {
    getObjectLayer(name: string) {
      const layer = map.layers.find((item) => item.name === name)
      if (!layer?.objects) return null

      return {
        objects: layer.objects.map((object) => ({
          ...object,
          x: object.x + (layer.offsetx ?? 0),
          y: object.y + (layer.offsety ?? 0),
        })),
      }
    },
  } as unknown as Parameters<typeof parseSlotsV2>[0]
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

  test('keeps every GraveObj slot aligned after Phaser applies its layer offset once', () => {
    const map4 = loadMap4()
    const graveLayer = getLayer(map4, 'GraveObj')
    const rawGraves = graveLayer.objects ?? []
    const slots = parseSlotsV2(createPhaserParsedMap(map4))

    expect(rawGraves).toHaveLength(144)
    for (const grave of rawGraves) {
      expect(slots.get(grave.id)).toMatchObject({
        id: grave.id,
        x: grave.x + (graveLayer.offsetx ?? 0),
        y: grave.y + (graveLayer.offsety ?? 0),
        width: grave.width,
        height: grave.height,
      })
    }
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

  test('keeps editor-only reference layers out of the production map view', () => {
    const map4 = loadMap4()

    expect(getLayer(map4, 'TreeX')).toMatchObject({ visible: false })
    expect(getLayer(map4, 'GraveVariantsReview_31')).toMatchObject({ visible: false })
  })

  test('uses Tiled bottom-left anchors only for tile objects', () => {
    const map4 = loadMap4()
    const chapelLayer = getLayer(map4, 'ChapelPreview_8d_lowdetail_palette_copy')
    const chapel = chapelLayer.objects?.[0]
    expect(chapel?.gid).toBeTruthy()

    const parsedChapel = {
      ...chapel!,
      x: chapel!.x + (chapelLayer.offsetx ?? 0),
      y: chapel!.y + (chapelLayer.offsety ?? 0),
    }
    expect(getTiledObjectBounds(parsedChapel)).toEqual({
      x: 1680,
      y: 1568,
      width: 160,
      height: 256,
    })
    expect(getTiledObjectCenter(parsedChapel)).toEqual({ x: 1760, y: 1696 })

    const graveLayer = getLayer(map4, 'GraveObj')
    const grave = graveLayer.objects?.find((object) => object.id === 10)
    const parsedGrave = {
      ...grave!,
      x: grave!.x + (graveLayer.offsetx ?? 0),
      y: grave!.y + (graveLayer.offsety ?? 0),
    }
    expect(getTiledObjectBounds(parsedGrave)).toEqual({
      x: 1568,
      y: 2656,
      width: 32,
      height: 64,
    })
  })

  test('derives all v2 building hitboxes from parsed preview objects', () => {
    const map4 = loadMap4()
    const slots = parseSlotsV2(createPhaserParsedMap(map4))
    const sources = [
      [5000, 'Chapel', 'ChapelPreview_8d_lowdetail_palette_copy', 'chapel_8d_160x256_lowdetail_palette_copy'],
      [5001, 'Gravedigger Lodge', 'GravediggerLodgePreview_map4', 'gravedigger_lodge_sysadmin_complete_map4'],
      [5002, 'Service Garage', 'ServiceBuildingsPreview_map4', 'service_garage_2x3_map4'],
      [5003, 'Service Building', 'ServiceBuildingsPreview_map4', 'service_technical_building_4x5_map4'],
      [5004, 'Main Gate', 'MainGate1dsQ4Preview_map4', 'main_gate_1ds_q4_full_320x160_map4_compare'],
      [5005, 'Side Wicket', 'Side_map4', 'side_wicket_chek_q1_extensions_512x96_map4_compare'],
    ] as const

    for (const [id, name, layerName, objectName] of sources) {
      const layer = getLayer(map4, layerName)
      const object = layer.objects?.find((item) => item.name === objectName)
      expect(object, `${name} preview object`).toBeTruthy()

      const parsedObject = {
        ...object!,
        x: object!.x + (layer.offsetx ?? 0),
        y: object!.y + (layer.offsety ?? 0),
      }
      expect(slots.get(id)).toMatchObject({
        id,
        name,
        type: 'Building',
        ...getTiledObjectBounds(parsedObject),
      })
    }

    expect(Array.from(slots.values()).filter((slot) => slot.type === 'Building')).toHaveLength(6)
  })
})
