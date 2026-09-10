'use client';

import { useEffect, useRef, useState } from 'react';
import StoneButton from '@/components/ui/StoneButton';
import { REKT_EPITAPHS, REKT_EPITAPH_MAX_LENGTH } from '@/gravedigger/rekt';
import { compareDecimal, isWalletAddress, UNAVAILABLE_REKT, usd, type RektAdapter, type RektCapabilities, type RektScan, type RektStep, type RektVerification } from './contracts';
import { rektClient } from './client';
import RektCandidateCard from './RektCandidateCard';
import RektMemorial, { memorialData, type RektMemorialView } from './RektMemorial';
import RektGravePreview from './RektGravePreview';
import type { GraveData } from '@/types/game';
import styles from './RektFlow.module.css';

interface Draft { address: string; scannedAddress: string; scan: RektScan | null; selectedId: string; epitaph: string; customEpitaph: string; requestId: string; burialKey: string; }
const freshDraft = (): Draft => ({ address: '', scannedAddress: '', scan: null, selectedId: '', epitaph: '', customEpitaph: '', requestId: '', burialKey: '' });
const titles: Record<RektStep, string> = { scan: 'Bury REKT', review: 'Your REKT', verify: 'Verify wallet', select: 'Select a loss', epitaph: 'Epitaph', preview: 'Your memorial', done: 'A resting place' };
const activeScan = (scan: RektScan | null) => Boolean(scan && ['queued', 'reading', 'calculating'].includes(scan.status));

export default function RektFlow({ adapter = rektClient, preview = false, previewScenario = 'complete', onCreated, onBusyChange }: {
  adapter?: RektAdapter; preview?: boolean; previewScenario?: string; onCreated?: (grave: GraveData) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const storageKey = preview ? `rekt:ui-preview:${previewScenario}` : 'rekt:ui-draft';
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (cached?.version === 1 && cached.savedAt > Date.now() - 30 * 60_000) return { ...freshDraft(), ...cached.draft };
    } catch { /* Storage may be unavailable. */ }
    return freshDraft();
  });
  const [step, setStep] = useState<RektStep>(() => draft.scan ? 'review' : 'scan');
  const [caps, setCaps] = useState<RektCapabilities>(UNAVAILABLE_REKT);
  const [capsLoading, setCapsLoading] = useState(true);
  const [capsError, setCapsError] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [verification, setVerification] = useState<RektVerification | null>(null);
  const [completed, setCompleted] = useState<RektMemorialView | null>(null);
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  const walletRevision = useRef(0);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scan = draft.scan;
  const selected = scan?.candidates.find(c => c.id === draft.selectedId);
  const epitaph = draft.customEpitaph.trim() || draft.epitaph;
  const patch = (value: Partial<Draft>) => setDraft(old => ({ ...old, ...value }));

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: Date.now(), draft })); } catch { /* Keep in-memory progress. */ }
  }, [draft, storageKey]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const abort = new AbortController();
    adapter.capabilities(abort.signal).then(value => {
      if (!abort.signal.aborted) { setCaps(value); setCapsError(''); setCapsLoading(false); }
    }).catch(() => {
      if (!abort.signal.aborted) { setCapsError('Network availability could not be checked. Please retry.'); setCapsLoading(false); }
    });
    return () => abort.abort();
  }, [adapter, refresh]);
  // Resume an existing job on reopen; closing aborts polling, not the server job.
  useEffect(() => {
    if (!scan?.id || !activeScan(scan)) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      adapter.readScan(scan.id, abort.signal).then(value => {
        if (!abort.signal.aborted) setDraft(old => ({ ...old, scan: { ...value, candidates: mergeCandidates(old.scan, value) } }));
      }).catch(err => { if (!abort.signal.aborted) setError(err.message || 'The scan could not be refreshed. Your results are preserved.'); });
    }, 1500);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [scan, adapter, refresh]);
  // Connected-address changes invalidate the UI's verified state; server still owns authorization.
  useEffect(() => {
    const provider = (window as unknown as { ethereum?: { on?: (event: string, fn: () => void) => void; removeListener?: (event: string, fn: () => void) => void } }).ethereum;
    const invalidate = () => { walletRevision.current++; setVerification(null); if (!lock.current) setStep(scan ? 'review' : 'scan'); };
    provider?.on?.('accountsChanged', invalidate);
    provider?.on?.('chainChanged', invalidate);
    return () => { provider?.removeListener?.('accountsChanged', invalidate); provider?.removeListener?.('chainChanged', invalidate); };
  }, [scan]);

  async function run(label: string, action: () => Promise<void>, writing = false) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError('');
    if (writing) onBusyChange?.(true);
    try { await action(); }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Something went wrong. Please retry.'); }
    finally { lock.current = false; if (alive.current) setBusy(''); if (writing) onBusyChange?.(false); }
  }
  function go(next: RektStep) { setError(''); setStep(next); }
  const expired = Boolean(scan && (!Number.isFinite(Date.parse(scan.expiresAt)) || Date.parse(scan.expiresAt) <= Date.now() || scan.status === 'expired'));
  const canScan = isWalletAddress(draft.address) && caps.networks.some(network => network.available);
  const candidates = [...(scan?.candidates || [])].sort((a, b) => compareDecimal(b.lossUsd, a.lossUsd));
  const verified = Boolean(verification && scan && verification.scanId === scan.id);
  const canSelect = verified && (verification?.availableSlots ?? 0) > 0 && !expired;

  return <div className={styles.body}>
    <h2 ref={heading} tabIndex={-1} className={styles.title}>{titles[step]}</h2>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {busy && <p role="status" aria-live="polite">{busy}</p>}

    {step === 'scan' && <form onSubmit={event => {
      event.preventDefault(); if (!canScan || busy) return;
      void run('Starting your scan…', async () => {
        const requestId = draft.requestId || crypto.randomUUID(); patch({ requestId });
        controller.current = new AbortController();
        const value = await adapter.scan(draft.address.trim(), ['base', 'robinhood'], requestId, controller.current.signal);
        if (!alive.current) return;
        patch({ scan: value, scannedAddress: draft.address.trim(), selectedId: '', burialKey: '' }); setVerification(null); go('review');
      });
    }}>
      <label className={styles.label} htmlFor="rekt-wallet">Wallet address<input id="rekt-wallet" className={styles.input} value={draft.address} onChange={e => patch({ address: e.target.value, requestId: '' })} placeholder="0x…" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={Boolean(draft.address && !isWalletAddress(draft.address))} aria-describedby={draft.address && !isWalletAddress(draft.address) ? 'rekt-address-help' : undefined} disabled={Boolean(busy)} /></label>
      {draft.address && !isWalletAddress(draft.address) && <p id="rekt-address-help" className={styles.meta}>Enter 0x followed by 40 hexadecimal characters.</p>}
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={!canScan || Boolean(busy) || capsLoading}>Scan wallet</button></div>
      {!capsLoading && (capsError ? <p className={styles.meta} role="alert">{capsError} <button className={styles.textButton} type="button" onClick={() => setRefresh(v => v + 1)}>Retry</button></p> : !caps.networks.some(n => n.available) && <p className={styles.meta} role="status">Wallet scanning is not available yet.</p>)}
    </form>}

    {(step === 'review' || step === 'select') && <>
      {scan && scan.status !== 'complete' && <div className={styles.notice} role="status"><strong>{expired ? 'Scan expired' : ({ queued: 'In the queue', reading: 'Reading history', calculating: 'Calculating closed positions', complete: 'Scan complete', partial: 'Partial results', failed: 'Scan interrupted', expired: 'Scan expired' })[scan.status]}</strong><br />{scan.coverage}<br />{scan.message}</div>}
      {expired && <p className={styles.error}>These results can be read, but must be scanned again before burial.</p>}
      {scan && !activeScan(scan) && !scan.candidates.length && <p>{scan.status === 'complete' ? 'No eligible closed losses were found in the checked history. Open positions, missing purchase history and unpriced trades cannot be confirmed.' : 'There are no confirmed results to show for this scan. This does not mean the wallet has no losses.'}</p>}
      {candidates.map(candidate => <RektCandidateCard key={candidate.id} candidate={candidate} selectable={step === 'select' && canSelect} selected={candidate.id === draft.selectedId} onSelect={() => { if (candidate.id !== draft.selectedId) patch({ selectedId: candidate.id, burialKey: '', epitaph: '', customEpitaph: '' }); }} />)}
      {scan?.nextCursor && <StoneButton type="button" disabled={Boolean(busy)} onClick={() => void run('Loading more stories…', async () => { controller.current = new AbortController(); const value = await adapter.readScan(scan.id, controller.current.signal, scan.nextCursor!); if (alive.current) patch({ scan: { ...value, candidates: mergeCandidates(scan, value) } }); })}>Load more stories</StoneButton>}
      {scan && (error || ['partial', 'failed'].includes(scan.status)) && <StoneButton type="button" disabled={Boolean(busy)} onClick={() => void run('Refreshing this scan…', async () => { controller.current = new AbortController(); const value = await adapter.readScan(scan.id, controller.current.signal); if (alive.current) { patch({ scan: { ...value, candidates: mergeCandidates(scan, value) } }); setRefresh(v => v + 1); } })}>Retry scan status</StoneButton>}
      {step === 'select' && verification && <p className={styles.meta}>{verification.availableSlots > 0 ? `${verification.availableSlots} REKT slots available` : 'No REKT slots left. Your existing graves stay.'}</p>}
      <div className={styles.actions}><StoneButton type="button" disabled={Boolean(busy)} onClick={() => go(step === 'select' ? 'review' : 'scan')}>Back</StoneButton>{step === 'review' ? <button className={styles.primary} disabled={Boolean(busy) || expired || !scan?.candidates.some(c => c.eligibility === 'eligible')} onClick={() => go(verified ? 'select' : 'verify')}>Next</button> : <button className={styles.primary} disabled={!canSelect || !selected || selected.eligibility !== 'eligible' || Boolean(busy)} onClick={() => go('epitaph')}>Next</button>}</div>
    </>}

    {step === 'verify' && <>
      <p className={styles.walletAddress}>{draft.scannedAddress}</p>
      <p className={styles.meta}>Sign a message to continue. Nothing moves from your wallet.</p>
      <details className={styles.help}><summary>Using FOMO?</summary><p className={styles.meta}>Use the personal wallet that made the first qualifying deposit into FOMO.</p></details>
      {!caps.verificationAvailable && <div className={styles.notice}>Wallet verification is not available yet. You can keep reviewing your results.</div>}
      <div className={styles.actions}><StoneButton type="button" disabled={Boolean(busy)} onClick={() => go('review')}>Back</StoneButton><button className={styles.primary} disabled={!caps.verificationAvailable || !scan || Boolean(busy) || expired} onClick={() => void run('Waiting for wallet verification…', async () => { const revision = walletRevision.current; const value = await adapter.verify(scan!.id); if (!alive.current) return; if (revision !== walletRevision.current) throw new Error('Wallet changed. Please verify again.'); if (value.scanId !== scan!.id || (value.method === 'direct' && value.wallet.toLowerCase() !== draft.scannedAddress.toLowerCase())) throw new Error('This verification does not match the scanned wallet. Please retry.'); setVerification(value); go('select'); })}>Sign message</button></div>
    </>}

    {step === 'epitaph' && selected && <>
      <p className={styles.meta}>{selected.token} · {usd(selected.lossUsd)} realized loss</p>
      <fieldset aria-label="Choose an epitaph"><div className={styles.options}>{REKT_EPITAPHS.slice(0, 3).map(text => <label className={styles.option} key={text}><input name="rekt-epitaph" type="radio" checked={draft.epitaph === text && !draft.customEpitaph} onChange={() => patch({ epitaph: text, customEpitaph: '', burialKey: '' })} />{text}</label>)}</div></fieldset>
      <label className={styles.label} htmlFor="rekt-epitaph">Or write your own<textarea id="rekt-epitaph" aria-describedby="rekt-epitaph-count" className={styles.input} value={draft.customEpitaph} maxLength={REKT_EPITAPH_MAX_LENGTH} rows={2} onChange={e => patch({ customEpitaph: e.target.value, epitaph: '', burialKey: '' })} placeholder="Your words for this stone" /><span id="rekt-epitaph-count" className={styles.counter}>{draft.customEpitaph.length}/{REKT_EPITAPH_MAX_LENGTH}</span></label>
      <div className={styles.actions}><StoneButton type="button" onClick={() => go('select')}>Back</StoneButton><button className={styles.primary} disabled={!epitaph || epitaph.length > REKT_EPITAPH_MAX_LENGTH || !canSelect} onClick={() => go('preview')}>Next</button></div>
    </>}

    {step === 'preview' && selected && <>
      <RektMemorial candidate={selected} epitaph={epitaph} />
      <p className={styles.quotaNote}>{verification?.availableSlots ?? 0} REKT {(verification?.availableSlots ?? 0) === 1 ? 'slot' : 'slots'} available</p>
      <p className={styles.quotaNote}>This memorial will be public.</p>
      {!caps.creationAvailable && <p className={styles.notice}>REKT burial is not available yet. Your draft is preserved.</p>}
      <div className={styles.actions}><StoneButton type="button" disabled={Boolean(busy)} onClick={() => go('epitaph')}>Back</StoneButton><button className={styles.primary} disabled={!caps.creationAvailable || Boolean(busy) || !canSelect || !epitaph || epitaph.length > REKT_EPITAPH_MAX_LENGTH} onClick={() => void run(preview ? 'Previewing the final step…' : 'Setting the stone…', async () => {
        const key = draft.burialKey || crypto.randomUUID(); patch({ burialKey: key });
        const result = await adapter.bury({ candidateId: selected.id, epitaph, idempotencyKey: key });
        if (!alive.current) return;
        setCompleted({ candidate: selected, epitaph }); setStep('done'); setDraft(freshDraft()); onCreated?.(result.grave);
      }, true)}>Bury REKT</button></div>
    </>}
    {step === 'done' && <>
      {completed && (preview ? <RektGravePreview data={memorialData(completed)} /> : <RektMemorial {...completed} />)}
      <p className={styles.quotaNote} role="status">{preview ? 'Preview complete. No grave was created.' : 'Your memorial has been saved.'}</p>
      {preview && <div className={styles.actions}><StoneButton type="button" onClick={() => { setCompleted(null); setVerification(null); go('scan'); }}>Start again</StoneButton></div>}
    </>}
  </div>;
}

function mergeCandidates(previous: RektScan | null, next: RektScan) {
  return [...new Map([...(previous?.candidates || []), ...next.candidates].map(candidate => [candidate.id, candidate])).values()];
}
