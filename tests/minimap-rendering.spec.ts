import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const minimapSource = readFileSync('src/components/hud/Minimap.tsx', 'utf8')

function section(from: string, to: string) {
  const start = minimapSource.indexOf(from)
  const end = minimapSource.indexOf(to, start)

  expect(start, `missing source marker: ${from}`).toBeGreaterThanOrEqual(0)
  expect(end, `missing source marker: ${to}`).toBeGreaterThan(start)

  return minimapSource.slice(start, end)
}

test('Minimap keeps terrain, markers, and camera viewport in independent layers', () => {
  const terrainRenderer = section('const drawTerrain', 'const drawMarkers')
  const markerRenderer = section('const drawMarkers', 'const drawViewport')
  const viewportRenderer = section('const drawViewport', 'const onTiles')

  expect(terrainRenderer).toContain('terrainCanvasRef')
  expect(terrainRenderer).toContain('for (let y = 0; y < td.mapHeight; y++)')
  expect(markerRenderer).toContain('markersCanvasRef')
  expect(markerRenderer).toContain('for (const [slotId] of gravesRef.current)')
  expect(markerRenderer).toContain('for (const b of buildingsRef.current)')
  expect(viewportRenderer).toContain('viewportCanvasRef')
  expect(viewportRenderer).toContain("ctx.fillText('\\u{1F441}'")

  expect(minimapSource).toContain('data-testid="minimap-terrain"')
  expect(minimapSource).toContain('data-testid="minimap-markers"')
  expect(minimapSource).toContain('data-testid="minimap-viewport"')
})

test('camera movement cannot trigger the terrain raster pass', () => {
  const tilesHandler = section('const onTiles', "cemeteryEvents.on('minimap_tiles', onTiles)")
  const cameraHandler = section('const onCameraMove', "cemeteryEvents.on('camera_move', onCameraMove)")

  expect(tilesHandler).toContain('drawTerrain()')
  expect(cameraHandler).toContain('drawViewport()')
  expect(cameraHandler).not.toContain('drawTerrain')
  expect(cameraHandler).not.toContain('drawMarkers')
})
