import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Page } from '@playwright/test'

/** Use the real local tilesets when available, avoiding Storage latency in UI tests. */
export async function serveLocalCemeteryAssets(page: Page) {
  await page.route('**/storage/v1/object/public/tilesets/*.png', async route => {
    const file = basename(new URL(route.request().url()).pathname)
    const path = join(process.cwd(), 'public', 'map', file)
    if (existsSync(path)) return route.fulfill({ path, contentType: 'image/png' })
    // Licensed v1 tilesets are not committed; remote Storage remains the fallback.
    return route.continue()
  })
}
