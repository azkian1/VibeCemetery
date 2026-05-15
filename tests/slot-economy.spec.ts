import { expect, test } from '@playwright/test'
import {
  calculateSouls,
  calculateUserSlotEconomy,
  getSlotUnlockProgress,
  NORMAL_SLOT_MAX,
  SOUL_SLOT_THRESHOLDS,
} from '../src/lib/slot-economy'

test.describe('user slot economy', () => {
  test('counts github cremations as 3 souls and skill cremations as 1 soul', () => {
    expect(calculateSouls([{ source: 'github' }, { source: 'skill' }, { source: 'github' }])).toBe(7)
  })

  test('counts unknown cremation sources as 0 souls', () => {
    expect(calculateSouls([{ source: 'unknown' as 'github' }])).toBe(0)
  })

  test('unlocks at most four normal grave slots', () => {
    expect(SOUL_SLOT_THRESHOLDS).toEqual([30, 100])
    expect(NORMAL_SLOT_MAX).toBe(4)

    expect(calculateUserSlotEconomy({ souls: 0, slotsUsed: 0, hasSharedFirstGrave: false })).toMatchObject({
      slotsUnlocked: 1,
      availableSlots: 1,
      nextSoulThreshold: 30,
    })

    expect(calculateUserSlotEconomy({ souls: 30, slotsUsed: 1, hasSharedFirstGrave: false })).toMatchObject({
      slotsUnlocked: 2,
      availableSlots: 1,
      nextSoulThreshold: 100,
    })

    expect(calculateUserSlotEconomy({ souls: 0, slotsUsed: 0, hasSharedFirstGrave: true })).toMatchObject({
      slotsUnlocked: 2,
      availableSlots: 2,
      nextSoulThreshold: 30,
    })

    expect(calculateUserSlotEconomy({ souls: 100, slotsUsed: 0, hasSharedFirstGrave: false })).toMatchObject({
      slotsUnlocked: 3,
      availableSlots: 3,
      nextSoulThreshold: null,
      allSlotsMaxed: false,
    })

    expect(calculateUserSlotEconomy({ souls: 100, slotsUsed: 2, hasSharedFirstGrave: true })).toMatchObject({
      slotsUnlocked: 4,
      availableSlots: 2,
      nextSoulThreshold: null,
    })

    expect(calculateUserSlotEconomy({ souls: 999, slotsUsed: 4, hasSharedFirstGrave: true })).toMatchObject({
      slotsUnlocked: 4,
      availableSlots: 0,
      allSlotsMaxed: true,
    })
  })

  test('labels social and souls slots by unlock source', () => {
    expect(getSlotUnlockProgress({ souls: 30, hasSharedFirstGrave: false })).toEqual({
      socialLabel: 'Social slot coming soon',
      unlockedSoulLabels: ['Souls slot 1 unlocked (30 Souls)'],
      nextSoulLabel: 'Souls slot 2: 100 Souls',
    })

    expect(getSlotUnlockProgress({ souls: 100, hasSharedFirstGrave: true })).toEqual({
      socialLabel: 'Social slot unlocked',
      unlockedSoulLabels: ['Souls slot 1 unlocked (30 Souls)', 'Souls slot 2 unlocked (100 Souls)'],
      nextSoulLabel: null,
    })
  })
})
