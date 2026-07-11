import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldHandleModalOverlayEscape } from '../src/components/modals/ModalOverlay'

test('modal stack uses explicit instance ids instead of serialized data keys', () => {
  const contextSource = readFileSync(join(process.cwd(), 'src', 'context', 'GameContext.tsx'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src', 'components', 'CemeteryApp.tsx'), 'utf8')

  expect(contextSource).toContain('id: ModalInstanceId')
  expect(contextSource).toContain('createModalInstanceId()')
  expect(appSource).toContain('key={entry.id}')
  expect(appSource).not.toContain('JSON.stringify(entry.data')
})

test('Escape only closes the top overlay when two modal stack entries remain mounted', () => {
  const isTopByEntry = [false, true]
  const closeCount = isTopByEntry.filter((isTop) => shouldHandleModalOverlayEscape(isTop, 'Escape')).length
  const overlaySource = readFileSync(join(process.cwd(), 'src', 'components', 'modals', 'ModalOverlay.tsx'), 'utf8')
  const appSources = [
    'CemeteryApp.tsx',
    'CemeteryAppV2.tsx',
  ].map((file) => readFileSync(join(process.cwd(), 'src', 'components', file), 'utf8'))

  expect(closeCount).toBe(1)
  expect(shouldHandleModalOverlayEscape(false, 'Escape')).toBe(false)
  expect(shouldHandleModalOverlayEscape(true, 'Enter')).toBe(false)
  expect(overlaySource).toContain('const isTop = useContext(ModalOverlayTopContext)')
  expect(overlaySource).toContain('if (!isTop) return;')
  expect(overlaySource).toContain('shouldHandleModalOverlayEscape(isTop, e.key)')
  for (const appSource of appSources) {
    expect(appSource).toContain('<ModalOverlayTopContext.Provider value={isTop}>')
  }
})
