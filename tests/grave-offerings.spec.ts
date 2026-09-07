import { expect, test } from '@playwright/test'
import { compareRawAmounts, formatGraveAmount } from '../src/lib/web3/offeringLedger'
import { loadGraveOfferings, type GraveOfferingRow } from '../src/lib/web3/graveOfferings'
import { cemeteryEvents } from '../src/game/events'

test('burn totals render whole tokens without floating point loss or rounding up', () => {
  expect(formatGraveAmount('25263442113724649798733865')).toBe('25,263,442')
  expect(formatGraveAmount('999999999999999999')).toBe('0')
  expect(formatGraveAmount('9007199254740993000000000000000001')).toBe('9,007,199,254,740,993')
  expect(compareRawAmounts('100000000000000000001', '100000000000000000002')).toBe(-1)
  expect(compareRawAmounts('200000000000000000000', '100000000000000000001')).toBe(1)
})

test('grave totals include every page and group repeated burns exactly', async () => {
  const rows: GraveOfferingRow[] = Array.from({ length: 1003 }, (_, i) => ({
    id: String(i).padStart(6, '0'), grave_id: i === 1002 ? 'second' : 'first',
    amount_raw: '100000000000000000001', graves: { name: i === 1002 ? 'Second grave' : 'First grave', author_github: null },
  }))
  const cursors: Array<string | null> = []
  const result = await loadGraveOfferings(async cursor => {
    cursors.push(cursor)
    // Simulate a server cap lower than the requested page size.
    return rows.filter(row => !cursor || row.id > cursor).slice(0, 250)
  })
  expect(result).toEqual([
    { graveId: 'first', graveName: 'First grave', author: null, amountRaw: '100200000000000000001002' },
    { graveId: 'second', graveName: 'Second grave', author: null, amountRaw: '100000000000000000001' },
  ])
  expect(cursors).toHaveLength(6)
})

test('failed later page never returns a misleading partial total', async () => {
  await expect(loadGraveOfferings(async cursor => {
    if (cursor) throw Error('database unavailable')
    return [{ id: '1', grave_id: 'a', amount_raw: '1', graves: { name: 'A', author_github: 'tester' } }]
  })).rejects.toThrow('database unavailable')
  await expect(loadGraveOfferings(async () => [
    { id: '1', grave_id: 'a', amount_raw: '1', graves: { name: 'A', author_github: 'tester' } },
  ])).rejects.toThrow('Invalid burn ledger cursor')
})

test('late minimap subscribers can recover raster and viewport but never replay actions', () => {
  cemeteryEvents.clear()
  const raster = { tiles: new Uint8Array([1, 2, 3, 1]), mapWidth: 2, mapHeight: 2 }
  const viewport = { scrollX: 1, scrollY: 2, viewWidth: 100, viewHeight: 50, zoom: 1 }
  cemeteryEvents.emit('minimap_tiles', raster)
  cemeteryEvents.emit('camera_move', viewport)
  cemeteryEvents.emit('minimap_click', { worldX: 10, worldY: 20 })
  expect(cemeteryEvents.getLatest('minimap_tiles')).toBe(raster)
  expect(cemeteryEvents.getLatest('camera_move')).toBe(viewport)
  expect(cemeteryEvents.getLatest('minimap_click')).toBeUndefined()
  cemeteryEvents.clear()
  expect(cemeteryEvents.getLatest('minimap_tiles')).toBeUndefined()
})
