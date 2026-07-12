import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenePath = join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts')

function section(source: string, from: string, to: string) {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  expect(start, `${from} start`).toBeGreaterThanOrEqual(0)
  expect(end, `${to} end`).toBeGreaterThan(start)
  return source.slice(start, end)
}

test('v2 trees receive compact ground shadows below their sprites', () => {
  const source = readFileSync(scenePath, 'utf8')
  const treeRenderer = section(source, 'private renderTreeSprites', 'private drawTreeGroundShadow')
  const shadowRenderer = section(source, 'private drawTreeGroundShadow', 'private emitMinimapTiles')

  expect(source).toContain('const TREE_SHADOW_DEPTH_V2 = 599;')
  expect(source).toContain('const TREE_SHADOW_Y_OFFSET_V2 = 2;')
  expect(source).toContain('const TREE_SHADOW_ROOT_INSET_V2: Record<number, number> = {')
  expect(source).toContain('35: 22,')
  expect(source).toContain('43: 15,')
  expect(treeRenderer).toContain('const treeShadows = this.add.graphics().setDepth(TREE_SHADOW_DEPTH_V2);')
  expect(treeRenderer).toContain('getTiledObjectBounds(obj)')
  expect(treeRenderer).toContain('this.drawTreeGroundShadow(treeShadows, getTiledObjectBounds(obj), obj.gid);')
  expect(treeRenderer.indexOf('this.drawTreeGroundShadow('))
    .toBeLessThan(treeRenderer.indexOf('this.add.sprite('))
  expect(treeRenderer).toContain('treeShadows.fillStyle(0x0b100c, 0.15);')
  expect(shadowRenderer).toContain('Phaser.Math.Clamp(bounds.width * 0.68, 16, 72)')
  expect(shadowRenderer).toContain('Phaser.Math.Clamp(bounds.height * 0.19, 10, 26)')
  expect(shadowRenderer).toContain('shadowLayer.fillEllipse(')
  expect(shadowRenderer).toContain('const rootInset = TREE_SHADOW_ROOT_INSET_V2[gid] ?? Math.round(bounds.height * 0.12);')
  expect(shadowRenderer).toContain('const visualRootY = bounds.y + bounds.height - rootInset;')
  expect(shadowRenderer).toContain('const shadowClearance = Phaser.Math.Clamp(bounds.height * 0.01, 1, 2);')
  expect(shadowRenderer).toContain('const shadowY = visualRootY - shadowHeight / 2 - shadowClearance + TREE_SHADOW_Y_OFFSET_V2;')
  expect(shadowRenderer).toContain('rootX,')
  expect(shadowRenderer).toContain('shadowY,')
})
