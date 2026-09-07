import { expect, test } from '@playwright/test'
import { countAutoAssignableGraveUsage, filterGravesToKnownMapSlots, getAutoAssignableGraveSlots, getGraveSlots, pickRandomFreeSlot } from '../src/lib/map-slots'

test.describe('map slot economy', () => {
  test('retired and unknown maps expose no slots and cannot allocate burials', () => {
    for (const version of ['v1', 'v3', '']) {
      expect(getGraveSlots(version)).toEqual([])
      expect(pickRandomFreeSlot(new Set(), version)).toBeNull()
    }
  })

  test('counts only graves occupying approved slots as normal user slot usage', () => {
    const autoSlot = getAutoAssignableGraveSlots()[0]
    expect(countAutoAssignableGraveUsage([
      { slot_id: autoSlot.id },
      { slot_id: 915309 },
      { slot_id: autoSlot.id },
    ])).toBe(2)
  })

  test('filters leaked smoke graves that do not belong to the current map', () => {
    const renderableSlot = getGraveSlots()[0]
    expect(filterGravesToKnownMapSlots([
      { id: 'real-grave', slot_id: renderableSlot.id },
      { id: 'leaked-smoke-grave', slot_id: 915309 },
    ])).toEqual([{ id: 'real-grave', slot_id: renderableSlot.id }])
  })

  test('keeps the migrated Oroshimoro grave slot renderable', () => {
    expect(getGraveSlots().find((slot) => slot.id === 111)).toEqual({ id: 111, type: 'grave_wide' })
  })

  test('includes all 144 approved v2 slots and all three footprints', () => {
    const autoSlots = getAutoAssignableGraveSlots()
    expect(autoSlots).toHaveLength(144)
    expect(new Set(autoSlots.map((slot) => slot.id)).size).toBe(144)
    expect(new Set(autoSlots.map((slot) => slot.type))).toEqual(
      new Set(['grave_tall', 'grave_wide', 'grave_large']),
    )
  })

  test('allocates only the remaining free slot and rejects a full map', () => {
    const slots = getAutoAssignableGraveSlots()
    const used = new Set(slots.map((slot) => slot.id))
    expect(pickRandomFreeSlot(used)).toBeNull()
    for (const type of ['grave_tall', 'grave_wide', 'grave_large']) {
      const remaining = slots.find((slot) => slot.type === type)!
      used.delete(remaining.id)
      expect(pickRandomFreeSlot(used)).toEqual(remaining)
      used.add(remaining.id)
    }
  })
})
