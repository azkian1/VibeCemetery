import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Page } from '@playwright/test'

/** Keep public image hosting separate from the inert application API settings. */
export async function serveLocalCemeteryAssets(page: Page) {
  await page.route('**/storage/v1/object/public/tilesets/*.png', async route => {
    const file = basename(new URL(route.request().url()).pathname)
    const path = join(process.cwd(), 'public', 'map', file)
    if (existsSync(path)) return route.fulfill({ path, contentType: 'image/png' })
    // Licensed v1 tilesets are not committed. A clean checkout can point this
    // optional variable at a public tileset folder; only image GETs go there.
    const remoteBase = process.env.PLAYWRIGHT_TILESET_BASE_URL?.trim()
    if (remoteBase) {
      const response = await route.fetch({ url: `${remoteBase.replace(/\/$/, '')}/${encodeURIComponent(file)}` })
      return route.fulfill({ response })
    }
    await route.abort('failed')
    throw new Error(`Missing v1 test asset ${file}: install the licensed PNG in public/map or set PLAYWRIGHT_TILESET_BASE_URL`)
  })
}
