import { expect, test } from '@playwright/test'

const LINK_ID = '11111111-1111-4111-8111-111111111111'
const CLAIM_TOKEN = 'claim-proof-test-token-1234567890'

test.describe('CLI connect page', () => {
  test('preserves approval proof across hash cleanup and reload', async ({ page }) => {
    await page.goto(`/cli/connect?link_id=${LINK_ID}#claim_token=${CLAIM_TOKEN}`)

    await expect(page.getByText('Sign in with GitHub first, then approve this link request.')).toBeVisible()
    await expect(page.getByText('This link request is missing approval proof.')).toHaveCount(0)

    await expect.poll(async () => {
      return page.evaluate(() => ({
        hash: window.location.hash,
        claimTokenEntries: Object.entries(sessionStorage).filter(([key]) => key.includes('cli-claim-token')),
      }))
    }).toEqual({
      hash: '',
      claimTokenEntries: [[`vc-cli-claim-token:${LINK_ID}`, CLAIM_TOKEN]],
    })

    await page.goto(`/cli/connect?link_id=${LINK_ID}`)

    await expect(page.getByText('Sign in with GitHub first, then approve this link request.')).toBeVisible()
    await expect(page.getByText('This link request is missing approval proof.')).toHaveCount(0)
  })
})
