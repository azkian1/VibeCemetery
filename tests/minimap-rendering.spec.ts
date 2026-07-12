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

test('Minimap keeps terrain, markers, fog, and camera viewport in independent layers', () => {
  const terrainRenderer = section('const drawTerrain', 'const drawFog')
  const fogRenderer = section('const drawFog', 'const drawMarkers')
  const markerRenderer = section('const drawMarkers', 'const drawViewport')
  const viewportRenderer = section('const drawViewport', 'const onTiles')

  expect(terrainRenderer).toContain('terrainCanvasRef')
  expect(terrainRenderer).toContain('for (let y = 0; y < td.mapHeight; y++)')
  expect(terrainRenderer).toContain('drawSmoothedRaster')
  expect(terrainRenderer).toContain('clipToLens')
  expect(fogRenderer).toContain('fogCanvasRef')
  expect(fogRenderer).toContain('td?.fog')
  expect(fogRenderer).toContain('FOG_COLORS')
  expect(fogRenderer).toContain('drawSmoothedRaster')
  expect(markerRenderer).toContain('markersCanvasRef')
  expect(markerRenderer).toContain('for (const [slotId] of gravesRef.current)')
  expect(markerRenderer).toContain('for (const b of buildingsRef.current)')
  expect(viewportRenderer).toContain('viewportCanvasRef')
  expect(viewportRenderer).toContain('ctx.fillRect(x, y, width, height)')
  expect(viewportRenderer).toContain('ctx.strokeRect(x + 0.5, y + 0.5, width, height)')
  expect(viewportRenderer).not.toContain('ctx.fillText')

  expect(minimapSource).toContain('data-testid="minimap-terrain"')
  expect(minimapSource).toContain('data-testid="minimap-markers"')
  expect(minimapSource).toContain('data-testid="minimap-fog"')
  expect(minimapSource).toContain('data-testid="minimap-viewport"')
  expect(minimapSource.indexOf('data-testid="minimap-markers"'))
    .toBeLessThan(minimapSource.indexOf('data-testid="minimap-fog"'))
  expect(minimapSource.indexOf('data-testid="minimap-fog"'))
    .toBeLessThan(minimapSource.indexOf('data-testid="minimap-viewport"'))
})

test('camera movement cannot trigger terrain, fog, or marker raster passes', () => {
  const tilesHandler = section('const onTiles', "cemeteryEvents.on('minimap_tiles', onTiles)")
  const cameraHandler = section('const onCameraMove', "cemeteryEvents.on('camera_move', onCameraMove)")

  expect(tilesHandler).toContain('drawTerrain()')
  expect(tilesHandler).toContain('drawFog()')
  expect(cameraHandler).toContain('drawViewport()')
  expect(cameraHandler).not.toContain('drawTerrain')
  expect(cameraHandler).not.toContain('drawFog')
  expect(cameraHandler).not.toContain('drawMarkers')
})

test('v2 minimap uses a circular cover projection with smooth raster layers', () => {
  expect(minimapSource).toContain('createMinimapProjection(V2_WORLD_W, V2_WORLD_H, SIZE)')
  expect(minimapSource).toContain('ctx.imageSmoothingEnabled = true')
  expect(minimapSource).toContain('ctx.imageSmoothingQuality = \'high\'')
  expect(minimapSource).not.toContain('imageRendering')
  expect(minimapSource).toContain('filter: \'saturate(0.84) contrast(0.92) blur(0.25px)\'')
  expect(minimapSource).toContain('filter: \'blur(0.35px)\'')
})

test('minimap ignores its clipped corners and converts CSS-scaled clicks through the lens projection', () => {
  expect(minimapSource).toContain('const canvasX = (e.clientX - rect.left) * (SIZE / rect.width);')
  expect(minimapSource).toContain('const canvasY = (e.clientY - rect.top) * (SIZE / rect.height);')
  expect(minimapSource).toContain('if (!isInsideMinimapLens(canvasX, canvasY, SIZE)) return;')
  expect(minimapSource).toContain('unprojectMinimapPoint(cfg, canvasX, canvasY)')
  expect(minimapSource).toContain("if (mapVersion === 'v2' && tileData)")
  expect(minimapSource).toContain('tileData.tiles[index] === 0 || tileData.fog?.[index] === 3')
  expect(minimapSource).not.toContain('clamp(')
})
