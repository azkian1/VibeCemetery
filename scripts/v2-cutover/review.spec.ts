import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { publicGrave } from '../../src/lib/public-grave'
import { readSlots, validateManifest, type Manifest, type Snapshot } from './manifest'

// Operator-only review. The inherited browser config uses inert server credentials;
// every API is mocked, every write and every external browser request is rejected.
const root = process.env.CUTOVER_REVIEW_DIR!
const read = (path: string) => readFileSync(join(root, path), 'utf8')
type Grave = Record<string, unknown> & { id: string; name: string; epitaph: string | null; f_count: number }
const graves: Grave[] = JSON.parse(read('rehearsal-v2-graves.json'))
const original: Grave[] = JSON.parse(read('read-only-export/graves.json'))
const snapshot: Snapshot = JSON.parse(read('inventory-snapshot.json'))
const manifest: Manifest = JSON.parse(read('preliminary-plan-utc/manifest.json'))
const mapText = readFileSync(resolve(__dirname, '../../public/map/cemetery-v2.tmj'), 'utf8')
validateManifest(manifest, snapshot, mapText)
const slots = readSlots(mapText)
const publicGraves = graves.map(publicGrave)
const burns: Array<{ grave_id: string; status: string; amount_raw: string }> = JSON.parse(
  read('read-only-export/grave_burns.json'),
  (key, value, context?: { source: string }) => {
    if (key !== 'amount_raw' || typeof value === 'string') return value
    if (!context || !/^\d+$/.test(context.source)) throw new Error('Node 22+ JSON source is required for exact amounts')
    return context.source
  },
)
const expectedIds = snapshot.graves.map(g => g.id).sort()
expect(graves.map(g => g.id).sort()).toEqual(expectedIds)
for (const grave of graves) {
  const old = original.find(g => g.id === grave.id)
  const placement = manifest.placements.find(p => p.grave_id === grave.id)
  expect(grave).toEqual(placement ? { ...old, map_version: 'v2', slot_id: placement.new_slot_id, grave_gid: placement.new_grave_gid } : old)
}

for (const width of [1280, 390]) {
  for (const grave of graves) {
    test(`${width}px ${grave.id} ${grave.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      const violations: string[] = []
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const total = burns.filter(b => b.grave_id === grave.id && b.status === 'verified')
        .reduce((sum, b) => sum + BigInt(b.amount_raw), 0n)
      const whole = (total / 10n ** 18n).toString()
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url())
        if (url.origin !== 'http://127.0.0.1:3010' || /\/map\/az\.tmj|\/storage\/v1\//.test(url.pathname) || !['GET', 'HEAD'].includes(req.method())) {
          violations.push(`${req.method()} ${url.origin}${url.pathname}`)
          return route.abort('blockedbyclient')
        }
        if (!url.pathname.startsWith('/api/')) return route.continue()
        let value: unknown = {}
        if (url.pathname === '/api/graves') value = publicGraves
        else if (url.pathname === '/api/f-status') value = { myVotes: [] }
        else if (url.pathname.endsWith('/burns')) value = {
          totalBurnedRaw: total.toString(), totalBurnedDisplay: whole,
          burnCount: burns.filter(b => b.grave_id === grave.id && b.status === 'verified').length, topMourners: [],
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
      })
      await page.goto('/cemetery?grave=' + grave.id)
      await expect(page.getByTestId('phaser-stage-v2')).toHaveAttribute('data-scene-ready', 'true')
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: grave.name, exact: true })).toBeVisible()
      if (grave.epitaph) await expect(dialog).toContainText(grave.epitaph)
      await expect(dialog.getByText('Respects', { exact: true }).locator('..')).toHaveText(new RegExp(`^Respects\\s*${grave.f_count}$`))
      await expect(dialog.getByRole('region', { name: 'GRAVE burn offering' }).locator('strong')).toHaveText(whole)
      await page.screenshot({ path: testInfo.outputPath('memorial.png') })
      await dialog.getByRole('button', { name: 'Find this grave on the map' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('gate-epitaph')).toHaveCount(0)
      await page.waitForTimeout(750) // Find-on-map delay + camera pan must finish before a pointer cancels it.
      await page.screenshot({ path: testInfo.outputPath('placement.png') })
      const slot = slots.find(s => s.id === grave.slot_id)!
      const slotWidth = slot.type === 'grave_tall' ? 32 : 64
      const slotHeight = slot.type === 'grave_wide' ? 32 : 64
      const camera = await page.getByTestId('phaser-stage-v2').evaluate(el => ({
        x: Number(el.dataset.cameraX), y: Number(el.dataset.cameraY), zoom: Number(el.dataset.cameraZoom),
        width: el.clientWidth, height: el.clientHeight,
      }))
      expect(camera.zoom).toBeGreaterThan(0)
      // Phaser zooms around the center of its viewport, including when the
      // terrain bounds prevent Find on Map from centering an edge grave.
      const point = {
        x: camera.width / 2 + (slot.x + slotWidth / 2 - camera.x - camera.width / 2) * camera.zoom,
        y: camera.height / 2 + (slot.y + slotHeight / 2 - camera.y - camera.height / 2) * camera.zoom,
      }
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(camera.width)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(camera.height)
      await page.getByTestId('phaser-stage-v2').locator('canvas').click({ position: point })
      await expect(dialog.getByRole('heading', { name: grave.name, exact: true })).toBeVisible()
      expect(violations).toEqual([])
      expect(errors).toEqual([])
    })
  }
}
