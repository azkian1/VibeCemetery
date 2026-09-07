export function inferGraveSlotTypeV2(width: number, height: number): string | null {
  if (width === 32 && height === 64) return 'grave_tall'
  if (width === 64 && height === 32) return 'grave_wide'
  if (width === 64 && height === 64) return 'grave_large'
  return null
}
