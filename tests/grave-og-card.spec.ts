import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { ImageResponse } from 'next/og'
import { getGraveArtNameLayout, getGraveArtCauseLayout, renderGraveArtImage } from '../src/app/grave/[id]/grave-art-image'
import { loadGraveOgArt, resolveGraveOgArtGid } from '../src/lib/grave-og-art'
import { getGraveSlots } from '../src/lib/map-slots'
import { pickGraveGidV2 } from '../src/game/utils/tileRegistry-v2'

test.describe('grave OpenGraph card', () => {
  test('uses the grave model shown on the map', () => {
    expect(resolveGraveOgArtGid({ grave_gid: 80, slot_id: 1, map_version: 'v2' })).toBe(80)
    const slot = getGraveSlots('v2').find(candidate => candidate.type === 'grave_large')!
    expect(resolveGraveOgArtGid({ slot_id: slot.id, map_version: 'v2' })).toBe(pickGraveGidV2(slot.type, slot.id))
    expect(resolveGraveOgArtGid({ grave_gid: 999, map_version: 'v1' })).toBe(52)
  })

  test('fits names and causes into bounded readable lines', () => {
    expect(getGraveArtNameLayout('DemoCast').lines).toEqual(['DemoCast'])
    expect(getGraveArtNameLayout('vue-project').lines).toEqual(['vue project'])
    const longName = getGraveArtNameLayout('super-long-component-library-name-with-many-segments')
    expect(longName.lines).toHaveLength(3)
    expect(longName.lines.every(line => line.length <= 18)).toBe(true)
    expect(getGraveArtNameLayout('W'.repeat(18)).fontSize).toBeLessThanOrEqual(32)
    const longCause = getGraveArtCauseLayout('A painfully slow death by endless scope creep')
    expect(longCause.lines).toHaveLength(2)
    expect(longCause.lines.every(line => line.length <= 24)).toBe(true)
  })

  test('every v2 grave model has a deployable image', async () => {
    for (let gid = 51; gid <= 97; gid++) {
      const image = await loadGraveOgArt(gid)
      expect(image).toMatch(/^data:image\/png;base64,/)
    }
  })

  test('renders approved grave art as a real 1200 by 630 PNG', async () => {
    const artSrc = await loadGraveOgArt(52)
    const cinzel = readFileSync('src/assets/og-fonts/Cinzel-Bold.ttf')
    expect(artSrc).toMatch(/^data:image\/png;base64,/)
    const response = new ImageResponse(renderGraveArtImage({
      name: 'DemoCast',
      cause: 'Lost interest',
      author: '@azkian1',
      lifeDates: 'Jan 2025 - Sep 2026',
      artSrc,
    }), { width: 1200, height: 630, fonts: [{ name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' }] })
    const png = Buffer.from(await response.arrayBuffer())
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  test('keeps the classic card available separately', () => {
    const classicRoute = readFileSync('src/app/grave/[id]/opengraph-image-classic/route.tsx', 'utf8')
    expect(classicRoute).toContain("buildGraveOpenGraphResponse(id, 'classic')")
  })
})
