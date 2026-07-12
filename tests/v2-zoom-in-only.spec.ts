import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8')
const zoomButtonsSource = readFileSync('src/components/hud/ZoomButtons.tsx', 'utf8')
const appSource = readFileSync('src/components/CemeteryAppV2.tsx', 'utf8')

function section(source: string, from: string, to: string) {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)

  expect(start, 'missing source marker: ' + from).toBeGreaterThanOrEqual(0)
  expect(end, 'missing source marker: ' + to).toBeGreaterThan(start)
  return source.slice(start, end)
}

test('v2 keeps the normal gameplay zoom as its zoom-out floor', () => {
  expect(sceneSource).toContain('this.minZoom = Math.max(fitZoom, 0.9);')
  expect(sceneSource).toContain('cam.zoomTo(this.minZoom, 2000, \'Sine.easeInOut\');')
})

test('v2 allows zoom-out input only down to the standard gameplay floor', () => {
  const pinchHandler = section(sceneSource, 'const scale = dist / this.prevPinchDist;', 'this.prevPinchDist = dist;')
  const wheelHandler = section(sceneSource, "this.input.on('wheel'", 'this.setupInteractiveZones();')
  const zoomEventHandler = section(sceneSource, 'private onZoomChange', 'private onBurialCeremony')

  expect(pinchHandler).not.toContain('if (scale > 1)')
  expect(wheelHandler).not.toContain('if (deltaY >= 0) return;')
  expect(zoomEventHandler).not.toContain('if (data.delta <= 0) return;')
  expect(pinchHandler).toContain('Phaser.Math.Clamp(cam.zoom * scale, this.minZoom, 2.0)')
  expect(wheelHandler).toContain('Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, this.minZoom, 2.0)')
  expect(zoomEventHandler).toContain('Phaser.Math.Clamp(cam.zoom + data.delta, this.minZoom, 2.0)')
})

test('v2 restores the shared zoom-out button for returning to standard zoom', () => {
  expect(zoomButtonsSource).toContain("cemeteryEvents.emit('zoom_change', { delta: -0.2 })")
  expect(appSource).toContain('<ZoomButtons />')
})
