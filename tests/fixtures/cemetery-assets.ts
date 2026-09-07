import type { Page } from '@playwright/test'

/** Every browser scenario must use only the app's own v2 assets. */
export async function rejectLegacyCemeteryAssets(page: Page) {
  await page.route(/\/storage\/v1\/object\/public\/tilesets\/|\/map\/az\.tmj/, async route => {
    await route.abort('blockedbyclient')
    throw new Error(`Retired map asset requested: ${new URL(route.request().url()).pathname}`)
  })
}
