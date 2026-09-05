import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenePath = join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts')

test('v2 does not create permanent building labels', () => {
  const source = readFileSync(scenePath, 'utf8')
  expect(source).not.toContain('this.createBuildingLabels()')
  expect(source).not.toContain('slot.name.toUpperCase()')
})
