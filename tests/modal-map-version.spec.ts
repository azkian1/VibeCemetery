import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('modal grave refetches inherit v1 by default and v2 from the cemetery shell', () => {
  const contextSource = readFileSync(join(process.cwd(), 'src', 'context', 'GameContext.tsx'), 'utf8')
  const v2AppSource = readFileSync(join(process.cwd(), 'src', 'components', 'CemeteryAppV2.tsx'), 'utf8')
  const modalSources = [
    'MausoleumModal.tsx',
  ].map((file) => readFileSync(join(process.cwd(), 'src', 'components', 'modals', file), 'utf8'))

  expect(contextSource).toContain("createContext<CemeteryMapVersion>('v1')")
  expect(v2AppSource).toContain('<CemeteryMapVersionContext.Provider value="v2">')
  for (const source of modalSources) {
    expect(source).toContain('const mapVersion = useCemeteryMapVersion()')
    expect(source).toContain('useGraves({ auto: false, mapVersion })')
  }
})
