import { test, expect } from '@playwright/test'
import {
  clampCameraCenter,
  clampCameraScroll,
  getCameraMetrics,
} from '../src/game/utils/camera'

test.describe('camera helpers', () => {
  test('keeps desktop intro zoom relative to fit zoom instead of jumping to 1.0', async () => {
    const metrics = getCameraMetrics({
      viewportWidth: 1440,
      viewportHeight: 900,
      isMobile: false,
    })

    expect(metrics.fitZoom).toBeCloseTo(0.75, 4)
    expect(metrics.startZoom).toBe(metrics.fitZoom)
    expect(metrics.targetZoom).toBeGreaterThan(metrics.fitZoom)
    expect(metrics.targetZoom).toBeLessThan(1)
  })

  test('keeps mobile intro zoom soft and bounded by fit zoom', async () => {
    const metrics = getCameraMetrics({
      viewportWidth: 390,
      viewportHeight: 844,
      isMobile: true,
    })

    expect(metrics.startZoom).toBe(metrics.fitZoom)
    expect(metrics.targetZoom).toBeGreaterThan(metrics.fitZoom)
    expect(metrics.targetZoom - metrics.fitZoom).toBeLessThan(0.06)
  })

  test('does not zoom out below fit on very large viewports', async () => {
    const metrics = getCameraMetrics({
      viewportWidth: 2560,
      viewportHeight: 1600,
      isMobile: false,
    })

    expect(metrics.targetZoom).toBe(metrics.fitZoom)
    expect(metrics.minZoom).toBe(metrics.fitZoom)
  })

  test('clamps camera center back into the world after resize', async () => {
    const center = clampCameraCenter({
      centerX: 1900,
      centerY: 1900,
      zoom: 0.75,
      viewportWidth: 1440,
      viewportHeight: 900,
    })

    expect(center.x).toBe(960)
    expect(center.y).toBeCloseTo(1320, 4)
  })

  test('clamps overscrolled camera scroll positions back into world bounds', async () => {
    const scroll = clampCameraScroll({
      scrollX: -120,
      scrollY: 1700,
      zoom: 0.75,
      viewportWidth: 1440,
      viewportHeight: 900,
    })

    expect(scroll.scrollX).toBe(0)
    expect(scroll.scrollY).toBeCloseTo(720, 4)
  })
})
