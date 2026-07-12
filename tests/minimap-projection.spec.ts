import { expect, test } from '@playwright/test'
import {
  createMinimapProjection,
  isInsideMinimapLens,
  projectWorldPoint,
  unprojectMinimapPoint,
} from '../src/game/utils/minimapProjection'

const SIZE = 140
const WORLD_W = 4480
const WORLD_H = 3328

test('circular v2 projection fills the lens without stretching map geometry', () => {
  const projection = createMinimapProjection(WORLD_W, WORLD_H, SIZE)

  expect(projection.scale).toBeCloseTo(SIZE / WORLD_H)
  expect(projection.contentH).toBeCloseTo(SIZE)
  expect(projection.contentW).toBeGreaterThan(SIZE)
  expect(projection.offsetX).toBeLessThan(0)
  expect(projection.offsetY).toBeCloseTo(0)
})

test('visible v2 world points round-trip through the circular minimap projection', () => {
  const projection = createMinimapProjection(WORLD_W, WORLD_H, SIZE)
  const points = [
    { x: 2240, y: 1664 },
    { x: 2240, y: 32 },
    { x: 2240, y: 3296 },
    { x: 600, y: 1664 },
    { x: 3880, y: 1664 },
    { x: 1200, y: 650 },
    { x: 3300, y: 2600 },
  ]

  for (const point of points) {
    const projected = projectWorldPoint(projection, point.x, point.y)
    expect(isInsideMinimapLens(projected.x, projected.y, SIZE)).toBe(true)

    const restored = unprojectMinimapPoint(projection, projected.x, projected.y)
    expect(restored.worldX).toBeCloseTo(point.x)
    expect(restored.worldY).toBeCloseTo(point.y)
  }
})

test('circular lens rejects square-only corners', () => {
  expect(isInsideMinimapLens(0, 0, SIZE)).toBe(false)
  expect(isInsideMinimapLens(SIZE, 0, SIZE)).toBe(false)
  expect(isInsideMinimapLens(0, SIZE, SIZE)).toBe(false)
  expect(isInsideMinimapLens(SIZE, SIZE, SIZE)).toBe(false)
  expect(isInsideMinimapLens(SIZE / 2, SIZE / 2, SIZE)).toBe(true)
})
