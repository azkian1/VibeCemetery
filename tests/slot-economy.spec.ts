import { expect, test } from '@playwright/test'
import {
  calculateUserSlotEconomy,
  getSlotUnlockProgress,
  NORMAL_SLOT_MAX,
} from '../src/lib/slot-economy'

test.describe('user slot economy', () => {
  test('starts every user with four normal grave slots', () => {
    expect(NORMAL_SLOT_MAX).toBe(4)

    expect(calculateUserSlotEconomy({ slotsUsed: 0, hasSharedFirstGrave: false })).toMatchObject({
      slotsUnlocked: 4,
      availableSlots: 4,
    })

    expect(calculateUserSlotEconomy({ slotsUsed: 4, hasSharedFirstGrave: false })).toMatchObject({
      slotsUnlocked: 4,
      availableSlots: 0,
      allSlotsMaxed: true,
    })
  })

  test('adds one normal grave slot after sharing the first grave', () => {
    expect(calculateUserSlotEconomy({ slotsUsed: 0, hasSharedFirstGrave: true })).toMatchObject({
      slotsUnlocked: 5,
      availableSlots: 5,
    })

    expect(calculateUserSlotEconomy({ slotsUsed: 4, hasSharedFirstGrave: true })).toMatchObject({
      slotsUnlocked: 5,
      availableSlots: 1,
      allSlotsMaxed: true,
    })
  })

  test('adds explicit demo bonus grave slots above the normal limit', () => {
    expect(calculateUserSlotEconomy({ slotsUsed: 28, hasSharedFirstGrave: true, bonusSlots: 5 })).toMatchObject({
      slotsUnlocked: 33,
      availableSlots: 5,
      canCreateGrave: true,
    })
  })

  test('labels the share mission by unlock state', () => {
    expect(getSlotUnlockProgress({ hasSharedFirstGrave: false })).toEqual({
      socialLabel: 'Share your Grave for +1 Slot',
    })

    expect(getSlotUnlockProgress({ hasSharedFirstGrave: true })).toEqual({
      socialLabel: 'Shared your Grave: +1 Slot',
    })
  })
})
