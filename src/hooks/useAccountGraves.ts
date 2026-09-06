'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useGame } from '@/context/GameContext'
import type { GraveData } from '@/types/game'
import type { UserSlotEconomy } from '@/lib/slot-economy'
export type AccountGraves = UserSlotEconomy & { graves: GraveData[] }
export function useAccountGraves() {
  const { data: session } = useSession()
  const { state } = useGame()
  const username = session?.user?.github_username
  const [result, setResult] = useState<{ username: string; data: AccountGraves | null; error: string | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const refetch = useCallback(() => setRevision(r => r + 1), [])
  useEffect(() => {
    if (!username) return
    const controller = new AbortController()
    fetch('/api/graves/account', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Account graves could not be loaded.')
        const data = await response.json() as AccountGraves
        if (!controller.signal.aborted) setResult({ username, data, error: null })
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ username, data: null, error: 'Account graves could not be loaded.' })
      })
    return () => controller.abort()
  }, [username, state.graves.size, session?.user?.x_first_grave_shared_at, revision])
  const current = result?.username === username ? result : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: Boolean(username && !current), refetch }
}
