import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenePath = join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts')

test('v2 building labels stay above their object bounds', () => {
  const source = readFileSync(scenePath, 'utf8')

  expect(source).toContain('const BUILDING_LABEL_GAP_V2 = 4;')
  expect(source).toContain('const BUILDING_LABEL_STACK_GAP_V2 = 4;')
  expect(source).toContain('const BUILDING_LABEL_DEPTH_V2 = 880;')
  expect(source).toContain('let ly = slot.y - BUILDING_LABEL_GAP_V2;')
  expect(source).toContain('label.setOrigin(0.5, 1);')
  expect(source).toContain('label.setDepth(BUILDING_LABEL_DEPTH_V2);')
  expect(source).toContain('ly = blockingTop - BUILDING_LABEL_GAP_V2;')
  expect(source).toContain('label.setY(placedBounds.top - BUILDING_LABEL_STACK_GAP_V2);')
})
