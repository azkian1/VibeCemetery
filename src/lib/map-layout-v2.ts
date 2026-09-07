/** Approved on 2026-09-07. Adding a TMJ object does not open a future zone. */
export const ACTIVE_GRAVE_SLOT_IDS_V2: readonly number[] = Object.freeze([
  1, 2, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25,
  26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
  65, 66, 67, 68, 69, 70, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102,
  103, 104, 106, 107, 109, 110, 111, 112, 116, 117, 118, 119, 120, 121, 122,
  127, 129, 130, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143,
  144, 145, 146, 147, 148, 149, 150, 151, 152, 158, 159, 160, 161, 162, 163,
  164, 165, 166, 167, 168, 169, 170, 171, 172, 488,
]);

export const CEMETERY_MASTER_CAPACITY_V2 = 666;
export const ACTIVE_GRAVE_CAPACITY_V2 = ACTIVE_GRAVE_SLOT_IDS_V2.length;
const activeSlotIds = new Set(ACTIVE_GRAVE_SLOT_IDS_V2);

export function isActiveGraveSlotV2(id: number): boolean {
  return activeSlotIds.has(id);
}

export function inferGraveSlotTypeV2(width: number, height: number): string | null {
  if (width === 32 && height === 64) return 'grave_tall'
  if (width === 64 && height === 32) return 'grave_wide'
  if (width === 64 && height === 64) return 'grave_large'
  return null
}
