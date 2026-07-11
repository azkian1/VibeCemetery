import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenePath = join(process.cwd(), 'src', 'game', 'scenes', 'CemeterySceneV2.ts')

function getNamedDepth(source: string, name: string) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`))
  expect(match, `${name} declaration`).toBeTruthy()
  return Number(match![1])
}

test('v2 fog of war renders above every world object', () => {
  const source = readFileSync(scenePath, 'utf8')
  const fogLayerDepths = [
    Number(source.match(/fog_soft_inner: (\d+),/)?.[1]),
    Number(source.match(/fog_soft_outer: (\d+),/)?.[1]),
    Number(source.match(/fog_locked_blockout: (\d+),/)?.[1]),
  ]
  const numericWorldDepths = [...source.matchAll(/\.setDepth\((\d+)\)/g)].map((match) => Number(match[1]))
  const vignetteDepth = getNamedDepth(source, 'FOG_VIGNETTE_DEPTH_V2')

  expect(fogLayerDepths).toEqual([2000, 2001, 2002])
  expect(source).toContain('if (fogDepth !== undefined) layer.setDepth(fogDepth);')
  expect(source).toContain('fog.setDepth(FOG_VIGNETTE_DEPTH_V2);')
  expect(Math.max(...numericWorldDepths)).toBeLessThan(Math.min(...fogLayerDepths))
  expect(vignetteDepth).toBeGreaterThan(Math.max(...fogLayerDepths))
})
