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

  test('urn modal only keeps share action', () => {
    const source = readFileSync('src/components/modals/UrnModal.tsx', 'utf8')

    expect(source).toContain('Share Urn')
    expect(source).not.toContain('Open GitHub Repo')
    expect(source).not.toContain('View Remains')
    expect(source).not.toContain("window.open(url, '_blank', 'noopener,noreferrer')")
  })
})
