import { expect, test, type Page } from '@playwright/test'
import { getAutoAssignableGraveSlots } from '../src/lib/map-slots'
import { rejectLegacyCemeteryAssets } from './fixtures/cemetery-assets'
import { createMinimapProjection, projectWorldPoint } from '../src/game/utils/minimapProjection'
import { pickGraveGidV2 } from '../src/game/utils/tileRegistry-v2'

const id = '22222222-2222-4222-8222-222222222222'
type MapVersion = 'v2'

function localGrave(mapVersion: MapVersion) {
  const slot = getAutoAssignableGraveSlots(mapVersion)[0]
  return { id, name: 'Local project', cause: 'Lost interest', source: 'local', author_github: 'tester',
    slot_id: slot.id, grave_gid: pickGraveGidV2(slot.type, 0),
    map_version: mapVersion, github_url: null, github_repo_id: null,
    epitaph: 'An idea laid to rest.', born_at: '2020-01-01', died_at: '2024-01-01', f_count: 2, stack: ['TypeScript'] }
}
const secondId = '33333333-3333-4333-8333-333333333333'
const ledger = { totalBurnedRaw: '100000000000000000001', burnCount: 1,
  authors: [{ author: 'tester', buried: 4, offeringsRaw: '100000000000000000001' }], causes: [{ cause: 'Lost interest', count: 4 }],
  graves: [{ graveId: id, graveName: 'Local project', author: 'tester', amountRaw: '25263442113724649798733865' },
    { graveId: secondId, graveName: 'Another project', author: 'other', amountRaw: '100000000000000000001' }],
  supply: { percent: 10, totalSupplyRaw: '1000000000000000000000', burnAddressBalanceRaw: '100000000000000000000', blockNumber: '42' },
  recent: [{ id, graveId: id, graveName: 'Local project', walletAddress: '0x' + '1'.repeat(40), githubUsername: null,
    amountRaw: '100000000000000000001', txHash: '0x' + 'a'.repeat(64), verifiedAt: '2026-09-06T00:00:00Z' }] }

async function fixtures(page: Page, mapVersion: MapVersion, options: { authenticated?: boolean; slotsUsed?: number; failLedger?: boolean; holdWrite?: Promise<void> } = {}) {
  await rejectLegacyCemeteryAssets(page)
  const grave = localGrave(mapVersion)
  let ledgerFailed = Boolean(options.failLedger)
  const writes: Record<string, unknown>[] = []
  const graves = [grave]
  let voted = false
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/api/auth/session') return json(options.authenticated ? { user: { name: 'Tester', github_username: 'Tester', x_first_grave_shared_at: null }, expires: '2099-01-01' } : {})
    if (url.pathname === '/api/graves/account') {
      const used = (options.slotsUsed ?? 1) + writes.length
      return json({ graves, slotsUsed: used, slotsUnlocked: 4, availableSlots: Math.max(0, 4 - used), canCreateGrave: used < 4 })
    }
    if (url.pathname === '/api/graves' && req.method() === 'GET') return json((url.searchParams.get('map_version') ?? 'v2') === mapVersion ? graves : [])
    if (url.pathname === '/api/graves' && req.method() === 'POST') {
      writes.push(req.postDataJSON())
      if (options.holdWrite) await options.holdWrite
      const slot = getAutoAssignableGraveSlots('v2')[1]
      const created = { ...grave, id: secondId, name: 'Old repo', slot_id: slot.id,
        grave_gid: pickGraveGidV2(slot.type, 1), source: 'github' }
      graves.push(created)
      return json({ ...created, github_repo_id: 42, github_url: 'https://github.com/Tester/repo' }, 201)
    }
    if (url.pathname === '/api/github/scan') return json({ total_repos: 1, dead_repos: [{ id: 42, name: 'Old repo', html_url: 'https://github.com/Tester/repo', created_at: '2020-01-01T00:00:00Z', pushed_at: '2024-01-01T00:00:00Z', language: 'TypeScript', fork: false }] })
    if (url.pathname === '/api/offerings') {
      return ledgerFailed ? json({ error: 'Unavailable' }, 503) : json(ledger)
    }
    if (url.pathname.endsWith('/burns')) return json({ totalBurnedRaw: '0', totalBurnedDisplay: '0', burnCount: 0, topMourners: [] })
    if (url.pathname === '/api/f-status') return json({ myVotes: voted ? [id] : [] })
    if (url.pathname === `/api/graves/${id}/f`) { grave.f_count++; voted = true; return json({ f_count: grave.f_count }) }
    return json({}) // Never forward test API requests to Supabase or a real wallet.
  })
  return { writes, recoverLedger: () => { ledgerFailed = false } }
}

for (const mapVersion of ['v2'] as const) {
test.describe(mapVersion, () => {
const mapPath = '/cemetery'

test('Necropolis recovers from a ledger error and shows whole burned token amounts', async ({ page }, testInfo) => {
  const { recoverLedger } = await fixtures(page, mapVersion, { failLedger: true })
  await page.goto(mapPath)
  await page.getByRole('button', { name: 'Open Necropolis leaderboard' }).click()
  await expect(page.getByText('The offering ledger could not be loaded.')).toBeVisible()
  recoverLedger()
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect(page.getByRole('columnheader', { name: /Burned.*\$GRAVE/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: '100', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /Cremated|Total/ })).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('necropolis.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('necropolis-mobile.png') })
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
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
  await expect(page.getByRole('dialog').getByText('Old repo', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.goto(`/cemetery?grave=${secondId}`)
  await expect(page.getByRole('dialog').getByText('Old repo', { exact: true })).toBeVisible()
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
  await expect(page.getByTestId('phaser-stage-v2')).toHaveAttribute('data-scene-ready', 'true')
  await page.waitForTimeout(2100) // Initial camera zoom lasts 2000 ms.
  const point = projectWorldPoint(createMinimapProjection(4480, 3328, 140), 3008, 2800)
  await page.getByRole('img', { name: 'Cemetery minimap' }).click({ position: point })
  await page.waitForTimeout(400) // Pointer-down otherwise cancels the 300 ms minimap pan.
  // The camera clamps at the playable map edge. At this viewport the service
  // building stays at this screen position after minimap navigation settles.
  // Building labels are deliberately hidden, so interact with the canvas.
  await expect(async () => {
    await page.mouse.click(1130, 480)
    await expect(page.getByRole('heading', { name: 'Crematory', exact: true })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 12_000 })
  await expect(page.getByRole('heading', { name: 'Crematory', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
  await expect(page.getByRole('link', { name: 'Local project', exact: true })).toHaveAttribute('href', '/grave/' + id)
  const table = page.getByRole('table', { name: 'Tributes', exact: true })
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Local project')
  await expect(rows.first().locator('td').last()).toHaveText('25,263,442')
  await table.getByRole('button', { name: '$GRAVE' }).click()
  await expect(rows.first()).toContainText('Another project')
  await expect(table.getByRole('columnheader', { name: '$GRAVE' })).toHaveAttribute('aria-sort', 'ascending')
  await expect(page.getByText(/Cemetery offerings|verified transaction|Recent offerings/)).toHaveCount(0)
  await expect(page.getByRole('dialog')).not.toContainText('100.000000000000000001')
  await page.screenshot({ path: testInfo.outputPath('crematory.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('crematory-mobile.png') })
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('the canonical cemetery serves v2', async ({ page }) => {
  await fixtures(page, mapVersion)
  const response = await page.goto(mapPath)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('phaser-stage-v2')).toHaveAttribute('data-scene-ready', 'true')
})

test('HUD and FAQ describe graves, the shared allowance and token tributes', async ({ page }) => {
  await fixtures(page, mapVersion)
  await page.goto(mapPath)
  await expect(page.getByText('Buried: 1', { exact: false })).toBeVisible()
  await expect(page.getByText(/Cremated|Cremations|Cremate a project/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'FAQ', exact: true }).click()
  await page.getByRole('button', { name: 'How many graves do I get?' }).click()
  await expect(page.getByRole('region', { name: 'How many graves do I get?' })).toContainText('share this account allowance')
  await page.getByRole('button', { name: 'What is the Crematory?' }).click()
  await expect(page.getByRole('region', { name: 'What is the Crematory?' })).toContainText('Tributes lists graves')
  await page.getByRole('button', { name: 'Can my AI agent bury a local project?' }).click()
  await expect(page.getByRole('region', { name: 'Can my AI agent bury a local project?' })).toContainText('normal grave')
})
})
}

test('v2 minimap survives late mounting and the red BURY button sits beside the bottom chat', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixtures(page, 'v2')
  await page.goto('/cemetery')
  await expect(page.getByTestId('phaser-stage-v2')).toHaveAttribute('data-scene-ready', 'true')
  await page.setViewportSize({ width: 1280, height: 800 })
  const minimap = page.getByRole('img', { name: 'Cemetery minimap' })
  const terrainPixels = () => minimap.evaluate((el: HTMLCanvasElement) => {
    const pixels = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0 && pixels[i + 1] > pixels[i] && pixels[i + 1] > pixels[i + 2]) count++
    }
    return count
  })
  // The shared circular renderer smooths tile edges. Count a substantial set
  // of exact interior terrain pixels, rather than the legacy nearest-neighbor
  // raster's larger count; an empty/background-only minimap has none.
  await expect.poll(terrainPixels).toBeGreaterThan(500)
  await expect(page.getByTestId('gate-epitaph')).toHaveCount(0)
  const chat = page.getByTestId('cemetery-chat')
  const bury = page.getByRole('button', { name: 'Bury a project', exact: true })
  const chatBox = (await chat.boundingBox())!, buryBox = (await bury.boundingBox())!
  expect(buryBox.x).toBeGreaterThan(chatBox.x + chatBox.width)
  expect(Math.abs(chatBox.y + chatBox.height - buryBox.y - buryBox.height)).toBeLessThan(2)
  expect(800 - chatBox.y - chatBox.height).toBe(16)
  await expect(bury).toHaveText('BURY')
  const redBackground = await bury.evaluate(el => getComputedStyle(el).backgroundImage)
  expect(redBackground).toContain('rgb(106, 40, 40)')
  await bury.hover()
  expect(await bury.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('rgb(128, 52, 52)')
  await page.getByTestId('chat-collapse-toggle').click()
  expect(800 - (await chat.boundingBox())!.y - (await chat.boundingBox())!.height).toBe(16)
  await page.getByTestId('chat-collapse-toggle').click()
  await page.screenshot({ path: testInfo.outputPath('v2-hud.png') })
  await bury.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // The minimap is mounted a second time after resizing, without a scene reload.
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(minimap).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect.poll(terrainPixels).toBeGreaterThan(500)
})

for (const version of ['v1', 'v2']) {
  test(`${version} redirect preserves deep link and future repeated query parameters`, async ({ page, request }) => {
    await fixtures(page, 'v2')
    const query = `grave=${id}&tag=one&tag=two&future=hello%20world`
    const response = await request.get(`/cemetery/${version}?${query}`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    const target = new URL(response.headers().location, 'http://127.0.0.1:3010')
    expect(target.pathname).toBe('/cemetery')
    expect(target.searchParams.getAll('tag')).toEqual(['one', 'two'])
    expect(target.searchParams.get('future')).toBe('hello world')
    await page.goto(`/cemetery/${version}?${query}`)
    await expect(page.getByRole('dialog').getByText('An idea laid to rest.')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/cemetery')
    await expect(page.getByRole('link', { name: /Switch to Cemetery/ })).toHaveCount(0)
  })
}

test('desktop and mobile cold loads use only v2 assets without runtime errors', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.url().includes('/map/') && response.status() >= 400) errors.push(response.url()) })
  await fixtures(page, 'v2')
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/cemetery')
    await expect(page.getByTestId('phaser-stage-v2')).toHaveAttribute('data-scene-ready', 'true')
    await expect(page.getByTestId('gate-epitaph')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Switch to Cemetery/ })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`cemetery-${viewport.width}.png`) })
  }
  expect(errors).toEqual([])
})

test('home scanner buries into v2 and carries ceremony to canonical cemetery', async ({ page }) => {
  const { writes } = await fixtures(page, 'v2', { authenticated: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan @Tester' }).click()
  await page.getByRole('button', { name: 'Bury', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Bury project', exact: true }).click()
  await expect(page).toHaveURL(/\/cemetery$/)
  await expect(page.getByRole('dialog').getByText('Old repo', { exact: true })).toBeVisible({ timeout: 30_000 })
  expect(writes).toHaveLength(1)
  expect(writes[0].map_version).toBe('v2')
})

test('meta memorial remains accessible at the canonical link', async ({ page }) => {
  await fixtures(page, 'v2')
  await page.goto('/cemetery?grave=meta')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('VibeCemetery')
})

test('F and profile preserve the UUID and shared account allowance on v2', async ({ page }) => {
  await fixtures(page, 'v2', { authenticated: true })
  await page.goto(`/cemetery?grave=${id}`)
  await page.getByRole('button', { name: 'Press F to pay respects (2)' }).click()
  await expect(page.getByRole('button', { name: 'Paid respects (3)' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Tester', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('1 / 4 used across your account')
  await expect(page.getByRole('dialog').getByRole('link', { name: /Local project/ })).toHaveAttribute('href', `/grave/${id}`)
})

test('GitHub login requests canonical callback and returns to the Bury modal', async ({ page }) => {
  const account = { authenticated: false }
  await fixtures(page, 'v2', account)
  let callback: string | null = null
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { github: { id: 'github', name: 'GitHub', type: 'oauth', signinUrl: '/api/auth/signin/github', callbackUrl: '/api/auth/callback/github' } } }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'mock-csrf' } }))
  await page.route('**/api/auth/signin/github', async route => {
    callback = new URLSearchParams(route.request().postData() ?? '').get('callbackUrl')
    account.authenticated = true
    await route.fulfill({ json: { url: `http://127.0.0.1:3010${callback}` } })
  })
  await page.goto('/cemetery/v2?modal=bury')
  await page.getByRole('dialog').getByRole('button', { name: /GitHub/ }).click()
  await expect.poll(() => callback).toBe('/cemetery?modal=bury')
  await expect(page.getByRole('heading', { name: 'Scan Repositories' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  expect(new URL(page.url()).pathname).toBe('/cemetery')
})

test('invalid UUID share links return 404 before querying memorial storage', async ({ request }) => {
  expect((await request.get('/grave/not-a-uuid')).status()).toBe(404)
})
