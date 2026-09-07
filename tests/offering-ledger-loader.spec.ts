import { expect, test } from '@playwright/test'
import { createOfferingLedgerLoader, type LedgerRows } from '../src/lib/web3/offeringLedgerLoader'
const rows: LedgerRows = { totalBurnedRaw: '100000000000000000001', burnCount: 1, authors: [], causes: [], recent: [], graves: [] }
const supply = { totalSupplyRaw: '1000', burnAddressBalanceRaw: '100', percent: 10, blockNumber: '42' }

test('Necropolis returns its database ledger without initiating a chain request', async () => {
  let chainCalls = 0
  const load = createOfferingLedgerLoader({ loadRows: async () => rows, loadSupply: async () => { chainCalls++; return supply } })
  expect(await load()).toEqual({ ...rows, supply: null })
  expect(chainCalls).toBe(0)
})

test('slow supply remains unavailable while totals are retained, and calls are coalesced', async () => {
  let resolve!: (value: typeof supply) => void
  let rowCalls = 0, chainCalls = 0
  const pending = new Promise<typeof supply>(r => { resolve = r })
  const load = createOfferingLedgerLoader({ loadRows: async () => { rowCalls++; return rows }, loadSupply: () => { chainCalls++; return pending }, supplyTimeoutMs: 5 })
  const result = await Promise.all([load(true), load(true)])
  expect(result).toEqual([{ ...rows, supply: null }, { ...rows, supply: null }])
  expect(rowCalls).toBe(1); expect(chainCalls).toBe(1)
  resolve(supply)
  expect(await load(true)).toEqual({ ...rows, supply })
})

test('failed chain lookup does not erase totals; database errors are retried', async () => {
  let fail = true
  const load = createOfferingLedgerLoader({ loadRows: async () => { if (fail) throw Error('DB down'); return rows }, loadSupply: async () => { throw Error('RPC down') } })
  await expect(load()).rejects.toThrow('DB down')
  fail = false
  expect(await load(true)).toEqual({ ...rows, supply: null })
})

test('expired ledger cache refreshes exact totals independently of supply cache', async () => {
  let now = 0, rowCalls = 0, chainCalls = 0
  const load = createOfferingLedgerLoader({ now: () => now, loadRows: async () => { rowCalls++; return { ...rows, burnCount: rowCalls } }, loadSupply: async () => { chainCalls++; return supply } })
  await load(true); now = 16_000
  expect((await load(true)).burnCount).toBe(2)
  expect(chainCalls).toBe(1)
})
