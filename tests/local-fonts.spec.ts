import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = process.cwd()

test('app fonts are self-hosted so builds do not need Google Fonts', () => {
  const layout = readFileSync(join(projectRoot, 'src', 'app', 'layout.tsx'), 'utf8')
  const styles = readFileSync(join(projectRoot, 'src', 'app', 'globals.css'), 'utf8')

  for (const asset of [
    'cinzel-latin.woff2',
    'cinzel-latin-ext.woff2',
    'geist-cyrillic-ext.woff2',
    'geist-cyrillic.woff2',
    'geist-vietnamese.woff2',
    'geist-latin-ext.woff2',
    'geist-latin.woff2',
    'geist-mono-cyrillic-ext.woff2',
    'geist-mono-cyrillic.woff2',
    'geist-mono-symbols.woff2',
    'geist-mono-vietnamese.woff2',
    'geist-mono-latin-ext.woff2',
    'geist-mono-latin.woff2',
  ]) {
    const assetPath = join(projectRoot, 'public', 'fonts', asset)
    expect(existsSync(assetPath)).toBe(true)
    expect(statSync(assetPath).size).toBeGreaterThan(0)
    expect(styles).toContain(`url('/fonts/${asset}')`)
  }

  expect(styles).toContain("font-family: 'Cinzel';")
  expect(styles).toContain("font-family: 'Geist';")
  expect(styles).toContain("font-family: 'Geist Mono';")
  expect(styles).toContain("--font-cinzel: 'Cinzel';")
  expect(styles).toContain("--font-geist-sans: 'Geist', Arial, sans-serif;")
  expect(styles).toContain("--font-geist-mono: 'Geist Mono', 'Consolas', 'Monaco', monospace;")
  expect(layout).not.toContain('fonts.googleapis.com')
  expect(layout).not.toContain('fonts.gstatic.com')
  expect(layout).not.toContain('next/font/google')
})
