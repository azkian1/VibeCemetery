import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('Phaser scale is driven by guarded ResizeObserver instead of automatic parent resize', () => {
  const configSource = readFileSync('src/game/config.ts', 'utf8')
  const canvasSource = readFileSync('src/components/PhaserCanvas.tsx', 'utf8')

  expect(configSource).toContain('mode: Phaser.Scale.NONE')
  expect(configSource).not.toContain('mode: Phaser.Scale.RESIZE')
  expect(canvasSource).toContain('ResizeObserver')
  expect(canvasSource).toContain('width <= 0 || height <= 0')
  expect(canvasSource).toContain('game.scale.resize(width, height)')
})
