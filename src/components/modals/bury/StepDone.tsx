'use client'
import Link from 'next/link'
import type { BuryResult } from '@/types/game'
import StoneButton from '@/components/ui/StoneButton'
export default function StepDone({ results, total, done, burying, onClose, onOpenProfile }: {
  results: BuryResult[]; total: number; done: number; burying: boolean; onClose: () => void; onOpenProfile?: () => void
}) {
  if (burying) return <p>{done}/{total} processed</p>
  return <div style={{ color: '#aaa9a0', textAlign: 'center' }}>
    {results.map((r, i) => <p key={i}>{r.success && r.grave ? <Link href={'/grave/' + r.grave.id}>{r.name} — Rest in peace</Link> : r.name + ' — ' + r.error}</p>)}
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
      {onOpenProfile && <StoneButton onClick={onOpenProfile}>View Profile</StoneButton>}
      <StoneButton onClick={onClose}>Close</StoneButton>
    </div>
  </div>
}
