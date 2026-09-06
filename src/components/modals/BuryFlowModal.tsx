'use client'
import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useModal, useGame, useCemeteryMapVersion } from '@/context/GameContext'
import { useAccountGraves } from '@/hooks/useAccountGraves'
import ModalOverlay from './ModalOverlay'
import { useIsMobile } from '@/hooks/useIsMobile'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import StepScan from './bury/StepScan'
import StepSelect from './bury/StepSelect'
import StepCause from './bury/StepCause'
import StepDone from './bury/StepDone'
import type { DeadRepo, GraveData, BuryResult } from '@/types/game'
import { GRAVEDIGGER_BURIAL } from '@/gravedigger/phrases'
import { cemeteryEvents } from '@/game/events'
import { savePendingBurialCeremony } from '@/lib/pending-burial-ceremony'

export type BuryFlowMode = 'default-scanner' | 'home-preselected-burial' | 'cemetery-shovel'
export default function BuryFlowModal() {
  const { close, open, modalData } = useModal()
  const { state, dispatch } = useGame()
  const { data: session } = useSession()
  const account = useAccountGraves()
  const mapVersion = useCemeteryMapVersion()
  const router = useRouter()
  const isMobile = useIsMobile()
  const initial = modalData?.initialDeadRepos ?? []
  const [step, setStep] = useState(initial.length ? 2 : 1)
  const [repos, setRepos] = useState<DeadRepo[]>(initial)
  const [selected, setSelected] = useState(new Set(initial.slice(0, 1).map(r => r.id)))
  const [causes, setCauses] = useState(new Map<number, string>())
  const [results, setResults] = useState<BuryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [burying, setBurying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filteredCount, setFilteredCount] = useState(0)
  const submitting = useRef(false)
  const handleScanned = (found: DeadRepo[]) => {
    const ids = new Set((account.data?.graves ?? [...state.graves.values()]).map(g => g.github_repo_id))
    const fresh = found.filter(repo => !ids.has(repo.id))
    setFilteredCount(found.length - fresh.length)
    setRepos(fresh)
    setSelected(new Set())
  }
  const submit = async () => {
    const repo = repos.find(r => selected.has(r.id))
    if (submitting.current || !repo || !account.data?.canCreateGrave) return
    submitting.current = true
    setBurying(true); setStep(4); setResults([])
    try {
      const response = await fetch('/api/graves', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'github', map_version: mapVersion,
          github_url: repo.html_url, github_repo_id: repo.id, name: repo.name,
          cause: causes.get(repo.id) || 'Developer lost interest',
          born_at: repo.created_at || undefined, died_at: repo.pushed_at || undefined,
          description: repo.description || undefined, stack: repo.language ? [repo.language] : undefined }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Burial failed. Please try again.')
      const grave = body as GraveData
      const ceremony = { slot_id: grave.slot_id, id: grave.id, name: grave.name,
        chatText: 'A project has been buried. Rest in peace.',
        gravediggerPhrase: GRAVEDIGGER_BURIAL[Math.floor(Math.random() * GRAVEDIGGER_BURIAL.length)] }
      const mapPath = mapVersion === 'v2' ? '/cemetery/v2' : '/cemetery'
      if (window.location.pathname === mapPath) cemeteryEvents.emit('burial_ceremony', ceremony)
      else {
        const saved = savePendingBurialCeremony(ceremony)
        router.push(saved ? mapPath : mapPath + '?grave=' + encodeURIComponent(grave.id))
      }
      dispatch({ type: 'ADD_GRAVE', grave })
      setResults([{ name: repo.name, success: true, type: 'grave', grave }])
      account.refetch()
      close()
    } catch (err) {
      setResults([{ name: repo.name, success: false, type: 'grave', error: err instanceof Error ? err.message : 'Network error. Check your profile before retrying.' }])
    } finally { submitting.current = false; setBurying(false) }
  }
  return <ModalOverlay onClose={burying ? () => {} : close}>
    <StoneFrame isMobile={isMobile} maxWidth={520}>
      <div style={{ padding: '24px 28px' }}>
        {!burying && <CloseButton onClick={close} />}
        <h2 style={{ color: '#e8d5a3', textAlign: 'center', fontSize: 20 }}>{['', 'Scan Repositories', 'Select a Project', 'Cause of Death', burying ? 'Burying...' : 'Burial Result'][step]}</h2>
        {account.error && <p role="alert">{account.error} <button onClick={account.refetch}>Retry</button></p>}
        {step === 1 && <StepScan repos={repos} loading={loading} error={error} username={session?.user?.github_username ?? null}
          filteredCount={filteredCount} recordsLoading={account.loading} onOpenSkill={() => open('skill')}
          onScanned={handleScanned} onError={setError} onNext={() => setStep(2)} setLoading={setLoading} />}
        {step === 2 && <StepSelect repos={repos} selected={selected} availableSlots={account.data?.availableSlots ?? 0}
          loading={account.loading} onToggle={id => setSelected(selected.has(id) ? new Set() : new Set([id]))}
          onNext={() => setStep(3)} onBack={() => initial.length ? close() : setStep(1)} />}
        {step === 3 && <StepCause repos={repos} selected={selected} causes={causes}
          onSetCause={(id, cause) => setCauses(old => new Map(old).set(id, cause))} onSubmit={submit} onBack={() => setStep(2)} loading={burying || !account.data?.canCreateGrave} />}
        {step === 4 && <StepDone results={results} total={1} done={burying ? 0 : 1} burying={burying} onClose={close} onOpenProfile={() => open('profile')} />}
      </div>
    </StoneFrame>
  </ModalOverlay>
}
