import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.describe('external window opens', () => {
  test('use noopener and noreferrer for new tabs', () => {
    const sources = [
      'src/components/hud/BurgerMenu.tsx',
    ].map((path) => readFileSync(path, 'utf8'))

    for (const source of sources) {
      expect(source).not.toMatch(/window\.open\([^\n]+,\s*['_"]_blank['_"]\s*\)/)
      expect(source).toContain("'_blank', 'noopener,noreferrer'")
    }
  })

  test('Crematory tributes navigate to internal grave details', () => {
    const source = readFileSync('src/components/modals/CrematoryModal.tsx', 'utf8')
    expect(source).toContain("href={'/grave/' + grave.graveId}")
    expect(source).not.toContain('BASE_EXPLORER_TX_URL + burn.txHash')
  })
})
