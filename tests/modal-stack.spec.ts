import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('modal stack uses explicit instance ids instead of serialized data keys', () => {
  const contextSource = readFileSync(join(process.cwd(), 'src', 'context', 'GameContext.tsx'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src', 'components', 'CemeteryApp.tsx'), 'utf8')

  expect(contextSource).toContain('id: ModalInstanceId')
  expect(contextSource).toContain('createModalInstanceId()')
  expect(appSource).toContain('key={entry.id}')
  expect(appSource).not.toContain('JSON.stringify(entry.data')
})
