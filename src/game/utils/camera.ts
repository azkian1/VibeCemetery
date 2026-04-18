const WORLD_SIZE = 1920
const DESKTOP_INTRO_DELTA = 0.06
const MOBILE_INTRO_DELTA = 0.04

export interface CameraMetricsInput {
  viewportWidth: number
  viewportHeight: number
  isMobile: boolean
}

export interface CameraMetrics {
  fitZoom: number
  minZoom: number
  startZoom: number
  targetZoom: number
}

interface CameraClampInput {
  viewportWidth: number
  viewportHeight: number
  zoom: number
}

interface CameraCenterInput extends CameraClampInput {
  centerX: number
  centerY: number
}

interface CameraScrollInput extends CameraClampInput {
  scrollX: number
  scrollY: number
}

export function getCameraMetrics({ viewportWidth, viewportHeight, isMobile }: CameraMetricsInput): CameraMetrics {
  const fitZoom = Math.max(viewportWidth / WORLD_SIZE, viewportHeight / WORLD_SIZE)
  const introDelta = isMobile ? MOBILE_INTRO_DELTA : DESKTOP_INTRO_DELTA

  return {
    fitZoom,
    minZoom: fitZoom,
    startZoom: fitZoom,
    targetZoom: Math.max(fitZoom, Math.min(fitZoom + introDelta, 1)),
  }
}

export function clampCameraCenter({
  centerX,
  centerY,
  zoom,
  viewportWidth,
  viewportHeight,
}: CameraCenterInput) {
  const halfW = viewportWidth / (zoom * 2)
  const halfH = viewportHeight / (zoom * 2)

  const minCenterX = Math.min(halfW, WORLD_SIZE / 2)
  const maxCenterX = Math.max(WORLD_SIZE - halfW, WORLD_SIZE / 2)
  const minCenterY = Math.min(halfH, WORLD_SIZE / 2)
  const maxCenterY = Math.max(WORLD_SIZE - halfH, WORLD_SIZE / 2)

  return {
    x: Math.min(Math.max(centerX, minCenterX), maxCenterX),
    y: Math.min(Math.max(centerY, minCenterY), maxCenterY),
  }
}

export function clampCameraScroll({
  scrollX,
  scrollY,
  zoom,
  viewportWidth,
  viewportHeight,
}: CameraScrollInput) {
  const viewWidth = viewportWidth / zoom
  const viewHeight = viewportHeight / zoom

  return {
    scrollX: Math.min(Math.max(scrollX, 0), Math.max(0, WORLD_SIZE - viewWidth)),
    scrollY: Math.min(Math.max(scrollY, 0), Math.max(0, WORLD_SIZE - viewHeight)),
  }
}

export { WORLD_SIZE }
