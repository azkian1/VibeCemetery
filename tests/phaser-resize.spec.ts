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

test('Cemetery scene unregisters EventBus listeners on Phaser shutdown', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8')

  expect(sceneSource).toContain('Phaser.Scenes.Events.SHUTDOWN')
  expect(sceneSource).toContain('Phaser.Scenes.Events.DESTROY')
  expect(sceneSource).toContain('this.shutdown')
  expect(sceneSource).toContain("cemeteryEvents.off('render_graves', this.onRenderGraves)")
})
