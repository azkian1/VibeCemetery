import { expect, test } from '@playwright/test'
import { cemeteryEvents } from '../src/game/events'

test('retains the latest minimap and viewport snapshots for late subscribers', () => {
  cemeteryEvents.clear()
  const tiles = new Uint8Array([1, 2, 3, 4])
  const minimap = { tiles, mapWidth: 2, mapHeight: 2, mapVersion: 'v2' }
  const viewport = {
    scrollX: 100,
    scrollY: 200,
    viewWidth: 300,
    viewHeight: 400,
    zoom: 1,
    mapVersion: 'v2',
  }

  cemeteryEvents.emit('minimap_tiles', minimap)
  cemeteryEvents.emit('camera_move', viewport)

  expect(cemeteryEvents.getLatest('minimap_tiles')).toBe(minimap)
  expect(cemeteryEvents.getLatest('camera_move')).toBe(viewport)

  cemeteryEvents.clear()
  expect(cemeteryEvents.getLatest('minimap_tiles')).toBeUndefined()
  expect(cemeteryEvents.getLatest('camera_move')).toBeUndefined()
})
