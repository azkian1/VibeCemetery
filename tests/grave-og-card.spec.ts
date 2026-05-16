import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const source = () => readFileSync('src/app/grave/[id]/opengraph-image.tsx', 'utf8')
const classicRoute = () => readFileSync('src/app/grave/[id]/opengraph-image-classic/route.tsx', 'utf8')

test.describe('grave OpenGraph card variants', () => {
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
