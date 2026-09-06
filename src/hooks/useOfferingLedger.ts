'use client'
import { useEffect, useState, useCallback } from 'react'
import type { OfferingLedger } from '@/lib/web3/offeringLedger'
export function useOfferingLedger({ includeSupply = false } = {}) {
  const [data, setData] = useState<OfferingLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refetch = useCallback(() => setRevision(r => r + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const r = await fetch(includeSupply ? '/api/offerings?supply=1' : '/api/offerings', { signal: controller.signal, cache: 'no-store' })
        if (!r.ok) throw new Error('The offering ledger could not be loaded.')
        const value = await r.json() as OfferingLedger
        if (!controller.signal.aborted) { setData(value); setError(null) }
      } catch { if (!controller.signal.aborted) setError('The offering ledger could not be loaded.') }
      finally { inFlight = false }
    }
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [revision, includeSupply])
  return { data, error, loading: !data && !error, refetch }
}
