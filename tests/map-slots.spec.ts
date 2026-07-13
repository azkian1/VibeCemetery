import { expect, test } from '@playwright/test'
import { countAutoAssignableGraveUsage, getAutoAssignableGraveSlots, getGraveSlots } from '../src/lib/map-slots'

test.describe('map slot economy', () => {
  test('keeps grave_special reserved outside the user slot economy', () => {
    const allSlots = getGraveSlots()
    const autoSlots = getAutoAssignableGraveSlots()

    expect(allSlots.some((slot) => slot.type === 'grave_special')).toBe(true)
    expect(autoSlots.some((slot) => slot.type === 'grave_special')).toBe(false)
    expect(new Set(autoSlots.map((slot) => slot.type))).toEqual(new Set(['grave', 'grave_tall']))
  })

  test('counts only graves occupying auto-assignable slots as normal user slot usage', () => {
    const autoSlot = getAutoAssignableGraveSlots()[0]
    const reservedSlot = getGraveSlots().find((slot) => !['grave', 'grave_tall'].includes(slot.type))

    expect(autoSlot).toBeTruthy()
    expect(reservedSlot).toBeTruthy()

    expect(countAutoAssignableGraveUsage([
      { slot_id: autoSlot.id },
      { slot_id: reservedSlot!.id },
      { slot_id: autoSlot.id },
    ])).toBe(2)
  })

  test('keeps existing Oroshimoro grave slot renderable', () => {
    const slot = getGraveSlots().find((item) => item.id === 289)

    expect(slot).toEqual({ id: 289, type: 'grave_tall' })
  })

  test('includes every Map4 grave footprint in automatic allocation', () => {
    const autoSlots = getAutoAssignableGraveSlots('v2')

    expect(autoSlots).toHaveLength(144)
    expect(new Set(autoSlots.map((slot) => slot.type))).toEqual(
      new Set(['grave_tall', 'grave_wide', 'grave_large']),
    )
  })
})
