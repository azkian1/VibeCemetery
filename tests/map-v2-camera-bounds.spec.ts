import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CAMERA_FOG_OVERSCROLL_V2,
  CAMERA_FOG_REST_BUFFER_V2,
  constrainCameraScrollToFog,
  getFogOverscrollBounds,
  getPlayableCameraScrollBounds,
  type FogClearAnchor,
} from '../src/game/utils/fogCameraBounds'

type TileLayer = {
  name: string
  width: number
  height: number
  offsetx?: number
  offsety?: number
  data?: number[]
}

type Map4 = {
  tilewidth: number
  tileheight: number
  layers: TileLayer[]
}

const sceneSource = readFileSync(join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts'), 'utf8')
const map4 = JSON.parse(readFileSync(join(process.cwd(), 'public', 'map', 'Map4.tmj'), 'utf8')) as Map4

function section(source: string, from: string, to: string) {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  expect(start, `${from} start`).toBeGreaterThanOrEqual(0)
  expect(end, `${to} end`).toBeGreaterThan(start)
  return source.slice(start, end)
}

test('v2 camera bounds match the non-empty authored terrain footprint', () => {
  const terrain = map4.layers.find((layer) => layer.name === 'pixellab_dualgrid_reconstructed')
  expect(terrain?.data).toBeTruthy()

  const occupied = terrain!.data!
    .map((value, index) => ({ value, x: index % terrain!.width, y: Math.floor(index / terrain!.width) }))
    .filter((tile) => tile.value !== 0)

  const minX = Math.min(...occupied.map((tile) => tile.x))
  const maxX = Math.max(...occupied.map((tile) => tile.x))
  const minY = Math.min(...occupied.map((tile) => tile.y))
  const maxY = Math.max(...occupied.map((tile) => tile.y))

  expect({
    minX: (terrain!.offsetx ?? 0) + minX * map4.tilewidth,
    minY: (terrain!.offsety ?? 0) + minY * map4.tileheight,
    maxX: (terrain!.offsetx ?? 0) + (maxX + 1) * map4.tilewidth,
    maxY: (terrain!.offsety ?? 0) + (maxY + 1) * map4.tileheight,
  }).toEqual({ minX: 800, minY: 1312, maxX: 3328, maxY: 3328 })

  expect(sceneSource).toContain(
    'const PLAYABLE_WORLD_BOUNDS_V2 = { minX: 800, minY: 1312, maxX: 3328, maxY: 3328 };',
  )
})

test('v2 fog drag has equal resisted space on all four edges and a short resting buffer', () => {
  const strictBounds = { minX: 800, minY: 1312, maxX: 2528, maxY: 2728 }
  const fogClearAnchors: FogClearAnchor[] = [{ left: 1000, top: 1000, right: 2000, bottom: 2000 }]
  const viewWidth = 800
  const viewHeight = 600
  const constrainCenter = (x: number, y: number, options = {}) => {
    const result = constrainCameraScrollToFog({
      scrollX: x - viewWidth / 2,
      scrollY: y - viewHeight / 2,
      viewWidth,
      viewHeight,
      strictBounds: { minX: 0, minY: 0, maxX: 5000, maxY: 5000 },
      fogClearAnchors,
      ...options,
    })
    return { x: result.x + viewWidth / 2, y: result.y + viewHeight / 2 }
  }

  expect(getFogOverscrollBounds(strictBounds)).toEqual({
    minX: 736,
    minY: 1248,
    maxX: 2592,
    maxY: 2792,
  })

  const left = constrainCenter(880, 1500)
  const right = constrainCenter(2120, 1500)
  const top = constrainCenter(1500, 880)
  const bottom = constrainCenter(1500, 2120)

  expect(1000 - left.x).toBeCloseTo(right.x - 2000)
  expect(1000 - top.y).toBeCloseTo(bottom.y - 2000)
  expect(1000 - left.x).toBeCloseTo(62.8)
  expect(1000 - top.y).toBeCloseTo(62.8)

  const farLeft = constrainCenter(-1000, 1500)
  const farBottom = constrainCenter(1500, 4000)
  expect(1000 - farLeft.x).toBeCloseTo(CAMERA_FOG_OVERSCROLL_V2)
  expect(farBottom.y - 2000).toBeCloseTo(CAMERA_FOG_OVERSCROLL_V2)

  const rest = constrainCenter(880, 1500, {
    maxFogDistance: CAMERA_FOG_REST_BUFFER_V2,
    freeFogDistance: CAMERA_FOG_REST_BUFFER_V2,
    resistance: 0,
  })
  expect(1000 - rest.x).toBeCloseTo(CAMERA_FOG_REST_BUFFER_V2)
})

test('v2 centres an oversized viewport on the playable area without leaving the full fogged world', () => {
  const playableBounds = { minX: 800, minY: 1312, maxX: 3328, maxY: 3328 }

  expect(getPlayableCameraScrollBounds(playableBounds, 3000, 600, 4480, 3328)).toEqual({
    minX: 564,
    minY: 1312,
    maxX: 564,
    maxY: 2728,
  })

  expect(getPlayableCameraScrollBounds(playableBounds, 4400, 600, 4480, 3328)).toEqual({
    minX: 0,
    minY: 1312,
    maxX: 0,
    maxY: 2728,
  })
})

test('v2 projects each real Map4 camera corner back toward an unlocked fog cell', () => {
  const lockedFog = map4.layers.find((layer) => layer.name === 'fog_locked_blockout')
  expect(lockedFog?.data).toBeTruthy()

  const fogClearAnchors: FogClearAnchor[] = lockedFog!.data!
    .map((value, index) => ({ value, x: index % lockedFog!.width, y: Math.floor(index / lockedFog!.width) }))
    .filter((tile) => tile.value === 0)
    .map((tile) => ({
      left: (lockedFog!.offsetx ?? 0) + tile.x * map4.tilewidth,
      top: (lockedFog!.offsety ?? 0) + tile.y * map4.tileheight,
      right: (lockedFog!.offsetx ?? 0) + (tile.x + 1) * map4.tilewidth,
      bottom: (lockedFog!.offsety ?? 0) + (tile.y + 1) * map4.tileheight,
    }))

  const strictBounds = { minX: 800, minY: 1312, maxX: 2688, maxY: 2848 }
  const viewWidth = 640
  const viewHeight = 480
  const nearestFogDistance = (x: number, y: number) => Math.min(...fogClearAnchors.map((anchor) => {
    const nearestX = Math.min(Math.max(x, anchor.left), anchor.right)
    const nearestY = Math.min(Math.max(y, anchor.top), anchor.bottom)
    return Math.hypot(x - nearestX, y - nearestY)
  }))

  for (const [scrollX, scrollY] of [
    [strictBounds.minX, strictBounds.minY],
    [strictBounds.maxX, strictBounds.minY],
    [strictBounds.minX, strictBounds.maxY],
    [strictBounds.maxX, strictBounds.maxY],
  ]) {
    const constrained = constrainCameraScrollToFog({
      scrollX,
      scrollY,
      viewWidth,
      viewHeight,
      strictBounds,
      fogClearAnchors,
    })
    expect(nearestFogDistance(constrained.x + viewWidth / 2, constrained.y + viewHeight / 2))
      .toBeLessThanOrEqual(CAMERA_FOG_OVERSCROLL_V2)
  }
})

test('v2 camera wires the real locked-fog mask into drag while zoom and minimap stay strict', () => {
  const dragHandler = section(sceneSource, "this.input.on('pointermove'", "this.input.on('pointerup'")
  const minimapHandler = section(sceneSource, 'private onMinimapClick', 'private onModalState')
  const zoomHandler = section(sceneSource, 'private onZoomChange', 'private buildFogCameraAnchors')
  const fogAnchorBuilder = section(sceneSource, 'private buildFogCameraAnchors', 'private constrainCameraDrag')
  const fogConstraint = section(sceneSource, 'private constrainCameraDrag', 'private getCameraFogSnapTarget')
  const snapTarget = section(sceneSource, 'private getCameraFogSnapTarget', 'private getCameraScrollBounds')
  const snapBack = section(sceneSource, 'const snapBack', "this.input.on('pointerdown'")
  const fogBackdrop = section(sceneSource, 'private createFogOverscrollBackdrop', 'private createFogVignette')

  expect(sceneSource).toContain("from '../utils/fogCameraBounds'")
  expect(sceneSource).toContain('this.buildFogCameraAnchors();')
  expect(sceneSource).toContain('this.scale.on(Phaser.Scale.Events.RESIZE, this.handleCameraResize);')
  expect(sceneSource).toContain('this.scale.off(Phaser.Scale.Events.RESIZE, this.handleCameraResize);')
  expect(dragHandler).toContain('this.constrainCameraDrag(rawX, rawY, cam, b)')
  expect(fogAnchorBuilder).toContain("this.map.getLayer('fog_locked_blockout')")
  expect(fogAnchorBuilder).toContain('if (tile?.index !== undefined && tile.index >= 0) continue;')
  expect(fogConstraint).toContain('constrainCameraScrollToFog({')
  expect(snapTarget).toContain('maxFogDistance: CAMERA_FOG_REST_BUFFER_V2')
  expect(snapTarget).toContain('resistance: 0')
  expect(snapBack).toContain('this.getCameraFogSnapTarget(cam, b)')
  expect(snapBack).toContain('duration: 220')
  expect(snapBack).toContain("ease: 'Sine.easeOut'")
  expect(minimapHandler).toContain('const bounds = this.getCameraScrollBounds(cam);')
  expect(minimapHandler).toContain('Phaser.Math.Clamp(data.worldX - vw / 2, bounds.minX, bounds.maxX)')
  expect(minimapHandler).toContain('Phaser.Math.Clamp(data.worldY - vh / 2, bounds.minY, bounds.maxY)')
  expect(zoomHandler).toContain('this.clampCameraToPlayableBounds(cam);')
  expect(fogBackdrop).toContain('fog.setDepth(FOG_VIGNETTE_DEPTH_V2)')
  expect(fogBackdrop).toContain('-CAMERA_FOG_OVERSCROLL_V2')
  expect(fogBackdrop).toContain('WORLD_H')
  expect(fogBackdrop).toContain('WORLD_W + CAMERA_FOG_OVERSCROLL_V2 * 2')
  expect(fogBackdrop).toContain('CAMERA_FOG_OVERSCROLL_V2,')
  expect(fogBackdrop).toContain('WORLD_W, 0, CAMERA_FOG_OVERSCROLL_V2, WORLD_H')
  expect(sceneSource).toContain('getPlayableCameraScrollBounds(')
})
