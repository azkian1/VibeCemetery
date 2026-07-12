import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type ObjectLayer = {
  name: string
  offsetx?: number
  offsety?: number
  objects?: Array<{ gid?: number; x?: number; y?: number; width?: number; height?: number }>
}

type Map4 = {
  layers: ObjectLayer[]
}

const scenePath = join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts')
const sceneSource = readFileSync(scenePath, 'utf8')
const map4 = JSON.parse(readFileSync(join(process.cwd(), 'public', 'map', 'Map4.tmj'), 'utf8')) as Map4

function section(source: string, from: string, to: string) {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  expect(start, `${from} start`).toBeGreaterThanOrEqual(0)
  expect(end, `${to} end`).toBeGreaterThan(start)
  return source.slice(start, end)
}

test('v2 buildings receive flattened shadows from their own sprite silhouettes', () => {
  const renderer = section(sceneSource, 'private renderBuildingPreviews', 'private renderBuildingGroundShadow')
  const shadowRenderer = section(sceneSource, 'private renderBuildingGroundShadow', 'private renderTreeSprites')
  const previewLayers = [
    'ChapelPreview_8d_lowdetail_palette_copy',
    'GravediggerLodgePreview_map4',
    'ServiceBuildingsPreview_map4',
    'MainGate1dsQ4Preview_map4',
    'Side_map4',
  ]
  const previewObjects = previewLayers.flatMap((name) => {
    const layer = map4.layers.find((candidate) => candidate.name === name)
    return (layer?.objects ?? []).map((object) => ({ layer, object }))
  })

  expect(previewObjects).toHaveLength(6)
  expect(previewObjects.map(({ layer, object }) => ({
    x: (object.x ?? 0) + (layer?.offsetx ?? 0),
    y: (object.y ?? 0) + (layer?.offsety ?? 0) - (object.height ?? 0),
    width: object.width,
    height: object.height,
  }))).toEqual([
    { x: 1680, y: 1568, width: 160, height: 256 },
    { x: 2208, y: 2912, width: 160, height: 160 },
    { x: 2880, y: 2784, width: 64, height: 96 },
    { x: 2944, y: 2720, width: 128, height: 160 },
    { x: 1600, y: 2976, width: 320, height: 160 },
    { x: 1504, y: 3040, width: 512, height: 96 },
  ])
  const mainGate = { x: 1600, y: 2976, width: 320, height: 160 }
  const sideWicket = { x: 1504, y: 3040, width: 512, height: 96 }
  expect(mainGate.x).toBeLessThan(sideWicket.x + sideWicket.width)
  expect(mainGate.x + mainGate.width).toBeGreaterThan(sideWicket.x)
  expect(mainGate.y).toBeLessThan(sideWicket.y + sideWicket.height)
  expect(mainGate.y + mainGate.height).toBeGreaterThan(sideWicket.y)

  expect(sceneSource).toContain('const BUILDING_SHADOW_DEPTH_V2 = 699;')
  expect(sceneSource).toContain('const BUILDING_PREVIEW_DEPTH_V2 = 700;')
  expect(sceneSource).toContain('const MAIN_GATE_PREVIEW_DEPTH_V2 = 701;')
  expect(sceneSource).toContain('const BUILDING_SHADOW_TINT_V2 = 0x0b100c;')
  expect(sceneSource).toContain('const BUILDING_SHADOW_BASE_INSET_V2: Record<string, number> = {')
  expect(sceneSource).toContain('chapel_8d_160x256_lowdetail_palette: 1,')
  expect(sceneSource).toContain('service_technical_building_4x5_map4: 17,')
  expect(sceneSource).toContain('side_wicket_chek_q1_extensions_512x96_map4_compare: 11,')
  expect(renderer).toContain('const bounds = getTiledObjectBounds(obj);')
  expect(renderer).toContain('this.renderBuildingGroundShadow(bounds, ts.name, obj.gid - ts.firstgid);')
  expect(renderer.indexOf('this.renderBuildingGroundShadow('))
    .toBeLessThan(renderer.indexOf('this.add.sprite('))
  expect(renderer).toContain("{ name: 'MainGate1dsQ4Preview_map4', depth: MAIN_GATE_PREVIEW_DEPTH_V2 },")
  expect(renderer).toContain("{ name: 'Side_map4', depth: BUILDING_PREVIEW_DEPTH_V2 },")
  expect(renderer).toContain(').setDepth(depth);')
  const mainGateDepth = Number(sceneSource.match(/const MAIN_GATE_PREVIEW_DEPTH_V2 = (\d+);/)?.[1])
  const sideWicketDepth = Number(sceneSource.match(/const BUILDING_PREVIEW_DEPTH_V2 = (\d+);/)?.[1])
  expect(mainGateDepth).toBeGreaterThan(sideWicketDepth)

  expect(shadowRenderer).toContain('Phaser.Math.Clamp(bounds.width * 0.94, 32, 512)')
  expect(shadowRenderer).toContain('Phaser.Math.Clamp(bounds.height * 0.18, 12, 48)')
  expect(shadowRenderer).toContain('const baseInset = BUILDING_SHADOW_BASE_INSET_V2[textureKey] ?? Math.round(bounds.height * 0.08);')
  expect(shadowRenderer).toContain('const visualBaseY = bounds.y + bounds.height - baseInset;')
  expect(shadowRenderer).toContain('textureKey,')
  expect(shadowRenderer).toContain('frame,')
  expect(shadowRenderer).toContain('shadow.setDisplaySize(shadowWidth, shadowHeight);')
  expect(shadowRenderer).toContain('shadow.setTintFill(BUILDING_SHADOW_TINT_V2);')
  expect(shadowRenderer).toContain('shadow.setAlpha(BUILDING_SHADOW_ALPHA_V2);')
  expect(shadowRenderer).toContain('shadow.setDepth(BUILDING_SHADOW_DEPTH_V2);')
  expect(shadowRenderer).toContain('visualBaseY - shadowHeight / 2 + BUILDING_SHADOW_Y_OFFSET_V2')
})
