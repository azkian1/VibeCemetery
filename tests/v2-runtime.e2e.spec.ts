import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, posix, resolve, relative } from 'node:path'
import ts from 'typescript'

// TypeScript strips types only. Relative imports use the actual source modules;
// the sole external module is the installed Phaser distribution, not a mock.
const modules: Record<string, string> = {}
function collect(file: string): string {
  const id = '/' + relative(process.cwd(), file).replaceAll('\\', '/')
  if (modules[id]) return id
  const source = readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  modules[id] = output
  for (const match of output.matchAll(/require\("([^"]+)"\)/g)) {
    if (match[1] === 'phaser') continue
    if (!match[1].startsWith('.')) throw new Error('Unexpected runtime dependency: ' + match[1])
    collect(resolve(dirname(file), match[1] + '.ts'))
  }
  return id
}
const sceneId = collect(resolve('src/game/scenes/CemeterySceneV2.ts'))
const pendingId = collect(resolve('src/lib/pending-burial-ceremony.ts'))
const projectionId = collect(resolve('src/game/utils/cameraProjection.ts'))
const eventsId = collect(resolve('src/game/events.ts'))
const tileRegistryId = collect(resolve('src/game/utils/tileRegistry-v2.ts'))
const map = JSON.parse(readFileSync('public/map/cemetery-v2.tmj', 'utf8'))

test.beforeEach(async ({ page }) => {
  // Give sessionStorage an origin; every request is intercepted locally.
  await page.route('**/*', route => {
    if (route.request().url() === 'http://v2-regression.invalid/') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' })
    }
    return route.abort('blockedbyclient')
  })
  await page.goto('http://v2-regression.invalid/')
  await page.addScriptTag({ path: resolve('node_modules/phaser/dist/phaser.js') })
  // Resolve import paths in Node so the browser loader needs no filesystem.
  const imports = Object.fromEntries(Object.entries(modules).map(([id, source]) => [id,
    Object.fromEntries([...source.matchAll(/require\("([^"]+)"\)/g)].map(match => [match[1],
      match[1] === 'phaser' ? 'phaser' : posix.normalize(posix.join(posix.dirname(id), match[1] + '.ts')),
    ])),
  ]))
  await page.evaluate(({ modules, imports, sceneId, pendingId, projectionId, eventsId, tileRegistryId, map }) => {
    // These objects belong only to this isolated test page, never the user's browser.
    const root = globalThis as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const cache = new Map<string, { exports: Record<string, unknown> }>()
    const load = (id: string): Record<string, unknown> => {
      if (id === 'phaser') return root.Phaser
      const cached = cache.get(id)
      if (cached) return cached.exports
      const loaded = { exports: {} }
      cache.set(id, loaded)
      new Function('require', 'module', 'exports', modules[id])(
        (name: string) => load(imports[id][name]), loaded, loaded.exports,
      )
      return loaded.exports
    }
    root.v2Test = {
      ...load(sceneId), ...load(projectionId), ...load(pendingId), ...load(eventsId), ...load(tileRegistryId), map,
    }
  }, { modules, imports, sceneId, pendingId, projectionId, eventsId, tileRegistryId, map })
})

for (const [width, height] of [[1280, 844], [369, 799]]) {
  for (const zoom of [0.9, 1, 2]) {
    test(`Find on Map, viewport and tooltip agree with Phaser at ${width}x${height}, zoom ${zoom}`, async ({ page }) => {
      const result = await page.evaluate(({ width, height, zoom }) => {
        const root = globalThis as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
        const { CemeterySceneV2, cemeteryEvents, worldPointToCamera } = root.v2Test
        const scene = new CemeterySceneV2()
        const camera = new root.Phaser.Cameras.Scene2D.Camera(0, 0, width, height)
        camera.setZoom(zoom)
        scene.cameras = { main: camera }
        scene.time = { now: 1_000 }
        scene.tweens = {
          killTweensOf() {},
          add(config: { scrollX: number; scrollY: number }) { camera.setScroll(config.scrollX, config.scrollY) },
        }
        scene.onMinimapClick({ worldX: 2000, worldY: 2300 })
        camera.preRender()
        scene.update()
        const view = cemeteryEvents.getLatest('camera_move')
        const tooltip = worldPointToCamera(camera, 2000, 2284)
        const tooltipWorld = camera.getWorldPoint(tooltip.x, tooltip.y)
        const visibleTopLeft = camera.getWorldPoint(0, 0)
        const visibleBottomRight = camera.getWorldPoint(width, height)
        return {
          center: { x: camera.midPoint.x, y: camera.midPoint.y },
          view,
          visibleTopLeft: { x: visibleTopLeft.x, y: visibleTopLeft.y },
          visibleBottomRight: { x: visibleBottomRight.x, y: visibleBottomRight.y },
          tooltip: { x: tooltip.x, y: tooltip.y },
          tooltipWorld: { x: tooltipWorld.x, y: tooltipWorld.y },
        }
      }, { width, height, zoom })
      expect(result.center.x).toBeCloseTo(2000)
      expect(result.center.y).toBeCloseTo(2300)
      // Phaser rounds its matrix origin to whole screen pixels. Odd viewport
      // dimensions can differ by half a screen pixel from the continuous view.
      const expectWorldClose = (actual: number, expected: number) =>
        expect(Math.abs(actual - expected) * zoom).toBeLessThanOrEqual(0.501)
      expectWorldClose(result.view.viewX, result.visibleTopLeft.x)
      expectWorldClose(result.view.viewY, result.visibleTopLeft.y)
      expectWorldClose(result.view.viewX + result.view.viewWidth, result.visibleBottomRight.x)
      expectWorldClose(result.view.viewY + result.view.viewHeight, result.visibleBottomRight.y)
      expect(result.tooltip.x).toBeCloseTo(width / 2)
      expect(result.tooltip.y).toBeCloseTo(height / 2 - 16 * zoom)
      expectWorldClose(result.tooltipWorld.x, 2000)
      expectWorldClose(result.tooltipWorld.y, 2284)
    })
  }
}

test('zoomed edge clamps and fog drag constrain the actual visible world, including after resize', async ({ page }) => {
  const results = await page.evaluate(() => {
    const root = globalThis as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const { CemeterySceneV2, cemeteryEvents } = root.v2Test
    const scene = new CemeterySceneV2()
    const camera = new root.Phaser.Cameras.Scene2D.Camera(0, 0, 1280, 844)
    scene.cameras = { main: camera }
    scene.time = { now: 1_000 }
    scene.fogClearAnchors = [{ left: 1700, top: 2000, right: 2300, bottom: 2600 }]
    const results = []
    for (const zoom of [0.9, 1, 2]) {
      camera.setZoom(zoom)
      for (const edge of [-100_000, 100_000]) {
        camera.setScroll(edge, edge)
        scene.clampCameraToPlayableBounds(camera)
        camera.preRender()
        const topLeft = camera.getWorldPoint(0, 0)
        const bottomRight = camera.getWorldPoint(camera.width, camera.height)
        results.push({ kind: 'edge', x: topLeft.x, y: topLeft.y, right: bottomRight.x, bottom: bottomRight.y })
      }
      for (const [x, y] of [[1400, 2300], [2600, 2300], [2000, 1800], [2000, 2800]]) {
        camera.centerOn(x, y)
        const bounds = scene.getCameraScrollBounds(camera)
        const constrained = scene.constrainCameraDrag(camera.scrollX, camera.scrollY, camera, bounds)
        camera.setScroll(constrained.x, constrained.y)
        camera.preRender()
        const distance = () => Math.hypot(
          camera.midPoint.x - Math.max(1700, Math.min(2300, camera.midPoint.x)),
          camera.midPoint.y - Math.max(2000, Math.min(2600, camera.midPoint.y)),
        )
        const dragDistance = distance()
        const snap = scene.getCameraFogSnapTarget(camera, bounds)
        camera.setScroll(snap.x, snap.y)
        camera.preRender()
        results.push({ kind: 'fog', dragDistance, restDistance: distance() })
      }
    }
    camera.setZoom(1)
    camera.centerOn(2000, 2300)
    scene.update()
    camera.setSize(1100, 700)
    scene.time.now += 100
    scene.update()
    results.push({ kind: 'resize', view: cemeteryEvents.getLatest('camera_move') })
    return results
  })
  for (const result of results) {
    if (result.kind === 'edge') {
      expect(result.x).toBeGreaterThanOrEqual(799.99)
      expect(result.y).toBeGreaterThanOrEqual(1311.99)
      expect(result.right).toBeLessThanOrEqual(3328.01)
      expect(result.bottom).toBeLessThanOrEqual(3328.01)
    } else if (result.kind === 'fog') {
      expect(result.dragDistance).toBeLessThanOrEqual(64.01)
      expect(result.restDistance).toBeLessThanOrEqual(32.01)
    } else {
      expect(result.view.viewWidth).toBe(1100)
      expect(result.view.viewHeight).toBe(700)
    }
  }
})

test('a server-picked gravestone keeps its texture through a carried ceremony and reconciliation', async ({ page }) => {
  const result = await page.evaluate(() => {
    const root = globalThis as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const { CemeterySceneV2, savePendingBurialCeremony, consumePendingBurialCeremony, map } = root.v2Test
    const grave = { slot_id: 10, id: 'fixture', name: 'fixture', grave_gid: 51 }
    savePendingBurialCeremony({ ...grave, chatText: 'fixture', gravediggerPhrase: 'fixture' })
    const data = consumePendingBurialCeremony()
    const scene = new CemeterySceneV2()
    scene.map = map
    scene.slots.set(10, { id: 10, x: 1568, y: 2656, width: 32, height: 64, type: 'grave_tall' })
    scene.input = { enabled: true }
    const textures: string[] = []
    scene.add = { sprite(_x: number, _y: number, key: string) {
      textures.push(key)
      return { active: true, setDisplaySize() {}, setTintFill() {}, setAlpha() {}, setDepth() {}, destroy() {} }
    } }
    scene.onSyncGraves({ graves: [grave], protectedSlotIds: [10], authoritative: true })
    // The reveal renders the same payload as the event/queued ceremony.
    scene.ceremonySlotIds.add(10)
    scene.renderGraveOnMap(data)
    const during = textures.at(-1)
    scene.finishBurialCeremony(10)
    return { carriedGid: data.grave_gid, during, after: textures.at(-1), spriteCount: textures.length }
  })
  expect(result.carriedGid).toBe(51)
  expect(result.during).toBe('grave_1x2_batch08_del_key_cross_style_v2_586efee3')
  expect(result.after).toBe(result.during)
  expect(result.spriteCount).toBe(2) // Shadow and sprite, without a replacement at the end.
})

test('a failed PNG cannot swallow a later critical TMJ failure', async ({ page }) => {
  const result = await page.evaluate(() => {
    const root = globalThis as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const { CemeterySceneV2, cemeteryEvents } = root.v2Test
    const scene = new CemeterySceneV2()
    scene.load = new root.Phaser.Events.EventEmitter()
    scene.load.tilemapTiledJSON = () => {}
    scene.load.image = () => {}
    const errors: unknown[] = []
    cemeteryEvents.on('load_error', (data: unknown) => errors.push(data))
    scene.preload()
    scene.load.emit('loaderror', { key: 'grass_flagstone_spritesheet', src: '/map/tilesets/grass_flagstone_spritesheet.png' })
    const afterPng = errors.length
    scene.load.emit('loaderror', { key: 'cemetery-map-v2', src: '/map/cemetery-v2.tmj' })
    scene.load.emit('loaderror', { key: 'cemetery-map-v2', src: '/map/cemetery-v2.tmj' })
    const criticalError = scene.assetLoadError
    scene.load.emit('complete')
    return { afterPng, errors, criticalError, remainingListeners: scene.load.listenerCount('loaderror') }
  })
  expect(result.afterPng).toBe(0)
  expect(result.errors).toEqual([{ assetKey: 'cemetery-map-v2', assetUrl: '/map/cemetery-v2.tmj' }])
  expect(result.criticalError).toEqual(result.errors[0])
  expect(result.remainingListeners).toBe(0)
})
