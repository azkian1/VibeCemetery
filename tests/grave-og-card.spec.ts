import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { getSocialNameLayout } from '../src/app/grave/[id]/opengraph-image'

const source = () => readFileSync('src/app/grave/[id]/opengraph-image.tsx', 'utf8')
const classicRoute = () => readFileSync('src/app/grave/[id]/opengraph-image-classic/route.tsx', 'utf8')

test.describe('grave OpenGraph card variants', () => {
  test('wraps separator-based project names on the social tombstone', () => {
    expect(getSocialNameLayout('vue-project')).toEqual({
      lines: ['vue', 'project'],
      fontSize: 48,
      lineHeight: 0.96,
    })
  })

  test('keeps simple short project names large on the social tombstone', () => {
    expect(getSocialNameLayout('DemoCast')).toEqual({
      lines: ['DemoCast'],
      fontSize: 86,
      lineHeight: 0.95,
    })
  })

  test('keeps natural spaced project names on the original social layout path', () => {
    expect(getSocialNameLayout('Demo Cast')).toEqual({
      lines: ['Demo Cast'],
      fontSize: 86,
      lineHeight: 0.95,
    })
  })

  test('uses compact fallback for long separator-based project names', () => {
    expect(getSocialNameLayout('veryverylongsegment-project')).toEqual({
      lines: ['veryve...', 'project'],
      fontSize: 42,
      lineHeight: 0.98,
    })
  })

  test('truncates both social tombstone lines for huge separator-based project names', () => {
    expect(getSocialNameLayout('super-long-component-library-name-with-many-segments')).toEqual({
      lines: ['super...', 'name w...'],
      fontSize: 40,
      lineHeight: 0.98,
    })
  })

  test('keeps classic card available while default card is optimized for X readability', () => {
    const ogSource = source()

    expect(ogSource).toContain('function renderClassicGraveShareImage')
    expect(ogSource).toContain('function renderSocialGraveShareImage')
    expect(ogSource).toContain('buildGraveOpenGraphResponse')
    expect(ogSource).toContain('fontSize: 86')
    expect(ogSource).toContain('fontSize: 72')
    expect(ogSource).toContain("color: '#ffe2a3'")
    expect(ogSource).toContain("color: '#fff4d4'")
    expect(classicRoute()).toContain("buildGraveOpenGraphResponse(id, 'classic')")
  })
})
