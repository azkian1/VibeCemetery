'use client';

import { useState } from 'react';
import RektFlow from './RektFlow';
import { type RektAdapter, type RektCandidate, type RektScan } from './contracts';
import StoneFrame from '@/components/ui/StoneFrame';
import { useIsMobile } from '@/hooks/useIsMobile';
import RektAccountPanel from './RektAccountPanel';
import RektGravePreview from './RektGravePreview';
import { memorialData } from './RektMemorial';

const sampleWallet = `0x${'1'.repeat(40)}`;
const sample: RektCandidate = {
  id: 'fictional-cycle', network: 'base', token: 'EXAMPLE', tokenAddress: `0x${'2'.repeat(40)}`,
  wallet: sampleWallet, lossUsd: '8000', lossPercent: '94.12', costUsd: '8500', proceedsUsd: '500',
  openedAt: '2026-05-04T00:00:00Z', closedAt: '2026-06-18T00:00:00Z', tradeCount: 6,
  proof: [], eligibility: 'eligible',
};
const sampleScan = (scenario: string): RektScan => ({
  id: `preview-${scenario}`, status: scenario === 'partial' ? 'partial' : scenario === 'failed' ? 'failed' : 'complete',
  candidates: ['empty', 'failed'].includes(scenario) ? [] : [sample, { ...sample, id: 'fictional-cycle-2', token: 'ANOTHER EXAMPLE', lossUsd: '300', lossPercent: '75', costUsd: '400', proceedsUsd: '100' }],
  coverage: scenario === 'partial' ? 'Base: example period checked. Robinhood Chain: not checked.' : 'Fictional Base history · May–June 2026. No live history was read.',
  message: scenario === 'failed' ? 'Example provider timeout. This is not an empty result.' : undefined,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
function previewAdapter(scenario: string): RektAdapter {
  const failedWrites = new Set<string>();
  return {
    capabilities: async () => ({ networks: [{ id: 'base', name: 'Base', available: true }, { id: 'robinhood', name: 'Robinhood Chain', available: scenario !== 'partial', reason: 'Unavailable in this preview.' }], verificationAvailable: true, creationAvailable: true }),
    connect: async () => sampleWallet,
    scan: async () => sampleScan(scenario),
    readScan: async () => sampleScan(scenario),
    verify: async scanId => {
      if (scenario === 'signature') throw new Error('Signature cancelled. Your results are still here.');
      if (scenario === 'wrong-wallet') throw new Error('This wallet does not match the trading wallet or its verified first-funding source. Connect the right wallet and retry.');
      return { scanId, wallet: sampleWallet, method: 'first_funding', availableSlots: scenario === 'no-slots' ? 0 : 2 };
    },
    bury: async input => {
      if (scenario === 'write-error' && !failedWrites.has(input.idempotencyKey)) {
        failedWrites.add(input.idempotencyKey);
        throw new Error('The write could not be confirmed. Please retry.');
      }
      // This object is never sent to the map or production APIs.
      return { grave: { id: 'preview-only', name: 'Fictional memorial', born_at: null, died_at: null, cause: null, epitaph: null, description: null, stack: null, github_url: null, github_repo_id: null, author_github: null, slot_id: 0, tier: 0 } };
    },
  };
}
const scenarios = ['complete', 'partial', 'empty', 'failed', 'signature', 'wrong-wallet', 'write-error', 'no-slots'];
const adapters = Object.fromEntries(scenarios.map(scenario => [scenario, previewAdapter(scenario)]));

export default function RektPreview({ scenario: requestedScenario = 'complete', initialView = 'flow' }: { scenario?: string; initialView?: string }) {
  const scenario = scenarios.includes(requestedScenario) ? requestedScenario : 'complete';
  const [view, setView] = useState(initialView === 'account' ? 'account' : initialView === 'grave' ? 'grave' : 'flow');
  const mobile = useIsMobile();
  return <main style={{ minHeight: '100dvh', background: '#0f0e0c', padding: '24px 0', display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 14 }}>
    <StoneFrame isMobile={mobile} maxWidth={520}>{view === 'grave' ? <RektGravePreview data={memorialData({ candidate: sample, epitaph: 'Bought with hope. Buried with receipts.' })} initialRespects={12} /> : view === 'flow' ? <RektFlow key={scenario} adapter={adapters[scenario]} preview previewScenario={scenario} /> : <div style={{ padding: 24 }}><p style={{ color: '#e8d5a3' }}>UI preview · Fictional account. No live records.</p><RektAccountPanel data={{ displayName: '0x1111…1111', code: { used: 0, limit: 2 }, rekt: { used: 0, limit: 2 }, bonus: null, wallets: [{ address: sampleWallet, network: 'Base', verified: true }], graves: [] }} onScan={() => setView('flow')} /></div>}</StoneFrame>
    <p role="note" style={{ color: '#a59b8d', font: '12px Arial, sans-serif', margin: 0 }}>UI preview · Sample data only. No real scan or burial.</p>
  </main>;
}
