import { expect, test } from '@playwright/test'
import { calculateUserSlotEconomy, GITHUB_SLOT_MAX, LOCAL_SLOT_MAX } from '../src/lib/slot-economy'

test('GitHub and local agent have one independent slot each', () => {
  expect(GITHUB_SLOT_MAX).toBe(1)
  expect(LOCAL_SLOT_MAX).toBe(1)
  expect(calculateUserSlotEconomy({ githubSlotsUsed: 0, localSlotsUsed: 0 })).toMatchObject({
    slotsUnlocked: 2, availableSlots: 2, githubAvailableSlots: 1, localAvailableSlots: 1,
  })
  expect(calculateUserSlotEconomy({ githubSlotsUsed: 1, localSlotsUsed: 0 })).toMatchObject({
    availableSlots: 1, githubAvailableSlots: 0, localAvailableSlots: 1,
    canCreateGithubGrave: false, canCreateLocalGrave: true,
  })
  expect(calculateUserSlotEconomy({ githubSlotsUsed: 1, localSlotsUsed: 1 })).toMatchObject({
    availableSlots: 0, allSlotsMaxed: true, canCreateGrave: false,
  })
})

test('existing graves over a source limit do not create extra allowance', () => {
  expect(calculateUserSlotEconomy({ githubSlotsUsed: 4, localSlotsUsed: 0 })).toMatchObject({
    slotsUsed: 4, githubAvailableSlots: 0, localAvailableSlots: 1,
  })
})