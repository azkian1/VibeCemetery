import { expect, test, type Page } from '@playwright/test'
import { getAutoAssignableGraveSlots } from '../src/lib/map-slots'
import { serveLocalCemeteryAssets } from './fixtures/cemetery-assets'

const id = '22222222-2222-4222-8222-222222222222'
type MapVersion = 'v1'

function localGrave(mapVersion: MapVersion) {
  const slot = getAutoAssignableGraveSlots()[0]
  return { id, name: 'Local project', cause: 'Lost interest', source: 'local', author_github: 'tester',
    slot_id: slot.id, grave_gid: null,
    map_version: mapVersion, github_url: null, github_repo_id: null,
    epitaph: 'An idea laid to rest.', born_at: '2020-01-01', died_at: '2024-01-01', f_count: 2, stack: ['TypeScript'] }
}
const ledger = { totalBurnedRaw: '100000000000000000001', burnCount: 1,
  authors: [{ author: 'tester', buried: 4, offeringsRaw: '100000000000000000001' }], causes: [{ cause: 'Lost interest', count: 4 }],
  supply: { percent: 10, totalSupplyRaw: '1000000000000000000000', burnAddressBalanceRaw: '100000000000000000000', blockNumber: '42' },
  recent: [{ id, graveId: id, graveName: 'Local project', walletAddress: '0x' + '1'.repeat(40), githubUsername: null,
    amountRaw: '100000000000000000001', txHash: '0x' + 'a'.repeat(64), verifiedAt: '2026-09-06T00:00:00Z' }] }

async function fixtures(page: Page, mapVersion: MapVersion, options: { authenticated?: boolean; slotsUsed?: number; failLedger?: boolean; holdWrite?: Promise<void> } = {}) {
  await serveLocalCemeteryAssets(page)
  const grave = localGrave(mapVersion)
  let ledgerFailed = Boolean(options.failLedger)
  const writes: Record<string, unknown>[] = []
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/api/auth/session') return json(options.authenticated ? { user: { name: 'Tester', github_username: 'Tester', x_first_grave_shared_at: null }, expires: '2099-01-01' } : {})
    if (url.pathname === '/api/graves/account') {
      const used = (options.slotsUsed ?? 1) + writes.length
      return json({ graves: [grave], slotsUsed: used, slotsUnlocked: 4, availableSlots: Math.max(0, 4 - used), canCreateGrave: used < 4 })
    }
    if (url.pathname === '/api/graves' && req.method() === 'GET') return json((url.searchParams.get('map_version') ?? 'v1') === mapVersion ? [grave] : [])
    if (url.pathname === '/api/graves' && req.method() === 'POST') {
      writes.push(req.postDataJSON())
      if (options.holdWrite) await options.holdWrite
      return json({ ...grave, source: 'github', github_repo_id: 42, github_url: 'https://github.com/Tester/repo' }, 201)
    }
    if (url.pathname === '/api/github/scan') return json({ total_repos: 1, dead_repos: [{ id: 42, name: 'Old repo', html_url: 'https://github.com/Tester/repo', created_at: '2020-01-01T00:00:00Z', pushed_at: '2024-01-01T00:00:00Z', language: 'TypeScript', fork: false }] })
    if (url.pathname === '/api/offerings') {
      return ledgerFailed ? json({ error: 'Unavailable' }, 503) : json(ledger)
    }
    if (url.pathname.endsWith('/burns')) return json({ totalBurnedRaw: '0', totalBurnedDisplay: '0', burnCount: 0, topMourners: [] })
    if (url.pathname === '/api/f-status') return json({ myVotes: [] })
    return json({}) // Never forward test API requests to Supabase or a real wallet.
  })
  return { writes, recoverLedger: () => { ledgerFailed = false } }
}

for (const mapVersion of ['v1'] as const) {
test.describe(mapVersion, () => {
const mapPath = '/cemetery'

test('Necropolis recovers from a ledger error and shows exact received offerings', async ({ page }, testInfo) => {
  const { recoverLedger } = await fixtures(page, mapVersion, { failLedger: true })
  await page.goto(mapPath)
  await page.getByRole('button', { name: 'Open Necropolis leaderboard' }).click()
  await expect(page.getByText('The offering ledger could not be loaded.')).toBeVisible()
  recoverLedger()
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect(page.getByRole('columnheader', { name: 'Offerings (GRAVE)' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '100.000000000000000001', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /Cremated|Total/ })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('necropolis.png') })
})

test('approved account submits one burial to the current map and guards a pending write', async ({ page }) => {
  let release!: () => void
  const holdWrite = new Promise<void>(resolve => { release = resolve })
  const { writes } = await fixtures(page, mapVersion, { authenticated: true, slotsUsed: 3, holdWrite })
  await page.goto(mapPath + '?modal=bury')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('radio').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Bury project', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Burying...' })).toBeVisible()
  expect(writes[0]).toMatchObject({ source: 'github', map_version: mapVersion, github_repo_id: 42, cause: 'Developer lost interest' })
  release()
  await expect(page.getByRole('heading', { name: 'Burying...' })).toHaveCount(0)
  expect(writes).toHaveLength(1)
})

test('shared account limit disables the grave action without offering cremation', async ({ page }) => {
  await fixtures(page, mapVersion, { authenticated: true, slotsUsed: 4 })
  await page.goto(mapPath)
  await expect(page.getByRole('button', { name: 'Bury a project', exact: true })).toBeDisabled()
  await expect(page.getByText('No grave slots left.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Cremate/ })).toHaveCount(0)
})

test('local grave deep link opens normal epitaph and offerings without a GitHub link', async ({ page }) => {
  await fixtures(page, mapVersion)
  await page.goto(mapPath + '?grave=' + id)
  await expect(page.getByRole('dialog').getByText('An idea laid to rest.')).toBeVisible()
  await page.getByRole('button', { name: 'Expand burn controls' }).click()
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link', { name: /GitHub/ })).toHaveCount(0)
})

test('Crematory building opens supply ledger and remains readable on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await fixtures(page, mapVersion)
  await page.goto(mapPath)
  await expect(page.getByTestId('phaser-stage')).toHaveAttribute('data-scene-ready', 'true')
  await page.waitForTimeout(2100) // Initial camera zoom lasts 2000 ms.
  const point = { x: 700 / 1920 * 140, y: 200 / 1920 * 140 }
  await page.getByRole('img', { name: 'Cemetery minimap' }).click({ position: point })
  await page.waitForTimeout(400) // Pointer-down otherwise cancels the 300 ms minimap pan.
  // The camera clamps at the playable map edge. At this viewport the service
  // building stays at this screen position after minimap navigation settles.
  // Building labels are deliberately hidden, so interact with the canvas.
  await expect(async () => {
    await page.mouse.click(640, 147)
    await expect(page.getByRole('heading', { name: 'Crematory', exact: true })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 12_000 })
  await expect(page.getByRole('heading', { name: 'Crematory', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
  await expect(page.getByRole('link', { name: 'Local project', exact: true })).toHaveAttribute('href', '/grave/' + id)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('crematory-mobile.png') })
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('production entry points expose only the released v1 map', async ({ page }) => {
  await fixtures(page, mapVersion)
  await page.goto(mapPath)
  await expect(page.locator('a[href="/cemetery/v2"]')).toHaveCount(0)
  const response = await page.goto('/cemetery/v2')
  expect(response?.status()).toBe(404)
})

test('HUD and FAQ describe graves, the shared allowance and token offerings', async ({ page }) => {
  await fixtures(page, mapVersion)
  await page.goto(mapPath)
  await expect(page.getByText('Buried: 1', { exact: false })).toBeVisible()
  await expect(page.getByText(/Cremated|Cremations|Cremate a project/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'FAQ', exact: true }).click()
  await page.getByRole('button', { name: 'How many graves do I get?' }).click()
  await expect(page.getByRole('region', { name: 'How many graves do I get?' })).toContainText('share this account allowance')
  await page.getByRole('button', { name: 'What is the Crematory?' }).click()
  await expect(page.getByRole('region', { name: 'What is the Crematory?' })).toContainText('GRAVE token offerings')
  await page.getByRole('button', { name: 'Can my AI agent bury a local project?' }).click()
  await expect(page.getByRole('region', { name: 'Can my AI agent bury a local project?' })).toContainText('normal grave')
})
})
}
