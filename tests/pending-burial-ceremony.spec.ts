import { expect, test } from '@playwright/test'
import {
  clearPendingBurialCeremony,
  consumePendingBurialCeremony,
  hasPendingBurialCeremony,
  PENDING_BURIAL_CEREMONY_KEY,
  readPendingBurialCeremony,
  savePendingBurialCeremony,
} from '../src/lib/pending-burial-ceremony'

const ceremony = {
  slot_id: 101,
  id: 'grave-101',
  name: 'dead-project',
  chatText: 'dead-project has been buried.',
  gravediggerPhrase: 'Another hole, another dream.',
}

test.beforeEach(() => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size },
    },
  })
  clearPendingBurialCeremony()
})

test.afterEach(() => {
  clearPendingBurialCeremony()
})

test('pending burial ceremony can be saved, read, and consumed once', () => {
  expect(savePendingBurialCeremony(ceremony, { now: 1_000, ttlMs: 10_000 })).toBe(true)
  expect(readPendingBurialCeremony({ now: 1_001 })).toEqual(ceremony)
  expect(hasPendingBurialCeremony({ now: 1_001 })).toBe(true)
  expect(consumePendingBurialCeremony({ now: 1_001 })).toEqual(ceremony)
  expect(readPendingBurialCeremony({ now: 1_002 })).toBeNull()
})

test('expired or malformed pending burial ceremony is cleared and never returned', () => {
  expect(savePendingBurialCeremony(ceremony, { now: 1_000, ttlMs: 100 })).toBe(true)
  expect(readPendingBurialCeremony({ now: 1_100 })).toBeNull()
  expect(sessionStorage.getItem(PENDING_BURIAL_CEREMONY_KEY)).toBeNull()

  sessionStorage.setItem(PENDING_BURIAL_CEREMONY_KEY, JSON.stringify({ slot_id: 'bad' }))
  expect(hasPendingBurialCeremony({ now: 2_000 })).toBe(false)
  expect(sessionStorage.getItem(PENDING_BURIAL_CEREMONY_KEY)).toBeNull()
})

test('save returns false when session storage write fails', () => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
  })

  expect(savePendingBurialCeremony(ceremony, { now: 1_000 })).toBe(false)
})
