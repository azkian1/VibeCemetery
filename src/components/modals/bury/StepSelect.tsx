'use client'
import type { DeadRepo } from '@/types/game'
import StoneButton from '@/components/ui/StoneButton'
export default function StepSelect({ repos, selected, availableSlots, loading, onToggle, onNext, onBack }: {
  repos: DeadRepo[]; selected: Set<number>; availableSlots: number; loading: boolean;
  onToggle: (id: number) => void; onNext: () => void; onBack: () => void;
}) {
  return <div>
    <p style={{ color: '#aaa9a0', fontSize: 13 }}>{loading ? 'Checking your grave allowance...' : availableSlots > 0 ? availableSlots + ' grave slots available across your account.' : 'No grave slots left. Your existing graves remain on the map.'}</p>
    <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 8 }}>
      {repos.map(repo => <label key={repo.id} style={{ padding: 12, border: '1px solid #3a3530', color: '#e8d5a3', cursor: 'pointer' }}>
        <input type="radio" name="burial-project" checked={selected.has(repo.id)} onChange={() => onToggle(repo.id)} />{' '}
        <strong>{repo.name}</strong>{repo.language ? ' — ' + repo.language : ''}
      </label>)}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
      <StoneButton onClick={onBack}>Back</StoneButton>
      <StoneButton onClick={onNext} disabled={loading || selected.size !== 1 || availableSlots <= 0}>Next</StoneButton>
    </div>
  </div>
}
