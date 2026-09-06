import type { OfferingLedger } from './offeringLedger'

export type LedgerRows = Omit<OfferingLedger, 'supply'>

/** Cache the database ledger independently from slower optional chain reads. */
export function createOfferingLedgerLoader({ loadRows, loadSupply, now = Date.now, supplyTimeoutMs = 3000 }: {
  loadRows: () => Promise<LedgerRows>
  loadSupply: () => Promise<OfferingLedger['supply']>
  now?: () => number
  supplyTimeoutMs?: number
}) {
  let rows: { at: number; value: LedgerRows } | null = null
  let pendingRows: Promise<LedgerRows> | null = null
  let supply: { at: number; value: OfferingLedger['supply'] } | null = null
  let pendingSupply: Promise<OfferingLedger['supply']> | null = null

  return async (includeSupply = false): Promise<OfferingLedger> => {
    if (!rows || now() - rows.at >= 15_000) {
      pendingRows ??= Promise.resolve().then(loadRows).then(value => {
        rows = { at: now(), value }
        return value
      }).finally(() => { pendingRows = null })
      await pendingRows
    }
    const ledger = rows!.value
    if (!includeSupply) return { ...ledger, supply: null }
    if (supply && now() - supply.at < (supply.value ? 60_000 : 10_000)) {
      return { ...ledger, supply: supply.value }
    }
    pendingSupply ??= Promise.resolve().then(loadSupply).catch(() => null).then(value => {
      supply = { at: now(), value }
      return value
    }).finally(() => { pendingSupply = null })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const value = await Promise.race([
        pendingSupply,
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), supplyTimeoutMs) }),
      ])
      return { ...ledger, supply: value }
    } finally { if (timer) clearTimeout(timer) }
  }
}
