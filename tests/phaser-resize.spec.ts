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

test('ceremony cleanup releases completed delayed calls and destroyed objects in both maps', () => {
  const sceneSources = [
    'src/game/scenes/CemeteryScene.ts',
    'src/game/scenes/CemeterySceneV2.ts',
  ].map((path) => readFileSync(path, 'utf8'))

  for (const source of sceneSources) {
    expect(source).toContain('private scheduleDelayedCall')
    expect(source).toContain('this.untrackTimer(timer)')
    expect(source).not.toContain('this.timers.push(this.time.delayedCall')
    expect(source).toContain('private trackCeremonyObject')
    expect(source).toContain('object.once(Phaser.GameObjects.Events.DESTROY')
    expect(source).toContain('this.ceremonyObjects.splice(index, 1)')
    expect(source).toContain('for (const obj of [...this.ceremonyObjects])')
  }
})
