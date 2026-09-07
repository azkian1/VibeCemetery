import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getBasePublicClient } from '@/lib/web3/baseClient'
import { burnedSupplyPercent } from '@/lib/web3/offeringLedger'
import { GRAVE_TOKEN_ADDRESS, GRAVE_BURN_ADDRESS } from '@/web3/config'
import { graveTokenAbi } from '@/web3/abi'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import type { NextRequest } from 'next/server'
import { createOfferingLedgerLoader, type LedgerRows } from '@/lib/web3/offeringLedgerLoader'
import { loadGraveOfferings, type GraveOfferingRow } from '@/lib/web3/graveOfferings'
const loadLedger = createOfferingLedgerLoader({
  loadRows: async () => {
    const [{ data, error }, graves] = await Promise.all([
      supabaseAdmin.rpc('get_offering_ledger'),
      loadGraveOfferings(async afterId => {
        let query = supabaseAdmin.from('grave_burns')
          .select('id,grave_id,amount_raw::text,graves!inner(name,author_github)')
          .eq('status', 'verified').order('id', { ascending: true }).limit(500)
        if (afterId) query = query.gt('id', afterId)
        const result = await query.returns<GraveOfferingRow[]>()
        if (result.error || !result.data) throw new Error('Grave burn ledger unavailable')
        return result.data
      }),
    ])
    if (error || !data) throw new Error('Ledger unavailable')
    return { ...data, graves } as LedgerRows
  },
  loadSupply: async () => {
    const client = await getBasePublicClient()
    const blockNumber = await client.getBlockNumber()
    const [totalSupply, burned] = await Promise.all([
      client.readContract({ address: GRAVE_TOKEN_ADDRESS, abi: graveTokenAbi, functionName: 'totalSupply', blockNumber }),
      client.readContract({ address: GRAVE_TOKEN_ADDRESS, abi: graveTokenAbi, functionName: 'balanceOf', args: [GRAVE_BURN_ADDRESS], blockNumber }),
    ])
    return { totalSupplyRaw: totalSupply.toString(), burnAddressBalanceRaw: burned.toString(), percent: burnedSupplyPercent(burned, totalSupply), blockNumber: blockNumber.toString() }
  },
})
export async function GET(req: NextRequest) {
  const rate = await checkRateLimit('offerings:' + getClientIp(req), 60, 60_000)
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)), 'Cache-Control': 'no-store' } })
  try {
    const data = await loadLedger(req.nextUrl.searchParams.get('supply') === '1')
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Offering ledger is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
