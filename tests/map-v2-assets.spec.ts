import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

test('every v2 runtime tileset resolves to a shipped PNG', () => {
  const root = resolve('public/map')
  const scene = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8')
  const loader = scene.match(/const TILESET_IMAGE: Record<string, string> = \{([\s\S]*?)\n    \};/)?.[1]
  expect(loader).toBeTruthy()
  const imageByName = Object.fromEntries(
    [...loader!.matchAll(/(\w+):\s*'([^']+)'/g)].map(match => [match[1], match[2]]),
  )
  const names = scene.match(/const TILESET_NAMES_V2 = \[([\s\S]*?)\n\];/)?.[1]
  expect(names).toBeTruthy()
  const loadedNames = [...names!.matchAll(/'([^']+)'/g)].map(match => match[1])
  const map = JSON.parse(readFileSync(resolve(root, 'cemetery-v2.tmj'), 'utf8')) as {
    tilesets: { name: string; image: string; imagewidth: number; imageheight: number }[]
  }
  expect(loadedNames.slice().sort()).toEqual(map.tilesets.map(tileset => tileset.name).sort())
  expect(Object.keys(imageByName).sort()).toEqual(loadedNames.slice().sort())
  const images = Object.values(imageByName)
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) {
    const file = resolve(root, image)
    expect(file.startsWith(root + sep), image).toBe(true)
    expect(existsSync(file), `Missing runtime asset: ${image}`).toBe(true)
    expect([...readFileSync(file).subarray(0, 8)], image).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }

  for (const tileset of map.tilesets) {
    const image = imageByName[tileset.name]
    expect(image, tileset.name).toBe(tileset.image.replace(/\.svg$/, '.png'))
    const png = readFileSync(resolve(root, image))
    expect(png.readUInt32BE(16), `${tileset.name} width`).toBe(tileset.imagewidth)
    expect(png.readUInt32BE(20), `${tileset.name} height`).toBe(tileset.imageheight)
  }

  // Existing ignored files can hide missing deployment assets on a developer's
  // machine. Accept tracked files and new, non-ignored files awaiting commit.
  const shippable = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  }).split('\0'))
  for (const image of ['cemetery-v2.tmj', ...images]) {
    expect(shippable.has(`public/map/${image}`), `Asset excluded from Git: ${image}`).toBe(true)
  }
})
