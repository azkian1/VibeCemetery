import type { GraveOffering } from './offeringLedger'

export interface GraveOfferingRow {
  id: string
  grave_id: string
  amount_raw: string
  graves: { name: string; author_github: string | null }
}

/** Read every verified page, not the 50-entry recent transaction feed. */
export async function loadGraveOfferings(
  readPage: (afterId: string | null) => Promise<GraveOfferingRow[]>,
): Promise<GraveOffering[]> {
  const graves = new Map<string, GraveOffering>()
  let afterId: string | null = null
  for (;;) {
    const page = await readPage(afterId)
    if (!page.length) break
    for (const row of page) {
      if (afterId !== null && row.id <= afterId) throw new Error('Invalid burn ledger cursor')
      if (typeof row.amount_raw !== 'string' || !/^\d+$/.test(row.amount_raw)) {
        throw new Error('Invalid raw burn amount')
      }
      const previous = graves.get(row.grave_id)
      graves.set(row.grave_id, {
        graveId: row.grave_id,
        graveName: row.graves.name,
        author: row.graves.author_github,
        amountRaw: (BigInt(previous?.amountRaw ?? '0') + BigInt(row.amount_raw)).toString(),
      })
      afterId = row.id
    }
  }
  return [...graves.values()]
}
