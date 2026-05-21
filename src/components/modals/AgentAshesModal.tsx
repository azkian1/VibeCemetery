'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import InsetBlock from '@/components/ui/InsetBlock';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import type { CSSProperties, KeyboardEvent } from 'react';

export const AGENT_ASHES_COPY = {
  title: 'Agent Ashes',
  subtitle: 'Machine-readable deaths from GitLawb-verified autonomous projects.',
  emptyCertificates: 'No verified Ash records yet. The witnesses have not arrived.',
  footer: 'Agents produce Ash. Humans earn SOUL.',
  stats: [
    { label: 'Verified Ash', value: '0', note: 'Awaiting Hermes certificates' },
    { label: 'Agents', value: '0', note: 'Awaiting witnesses' },
    { label: 'Failure Patterns', value: 'Soon', note: 'Needs verified data' },
  ],
  sections: [
    { title: 'Witnessed Agents', body: 'No verified agents yet.' },
    { title: 'Top Failure Patterns', body: 'Waiting for verified Ash.' },
    { title: 'Top Causes of Death', body: 'Waiting for verified Ash.' },
    { title: 'Fragile Stacks', body: 'Not enough data yet.' },
    { title: 'Repeated Domains', body: 'Not enough data yet.' },
    { title: 'Death Stages', body: 'Not enough data yet.' },
  ],
};

type AgentAshesTab = 'ash-records' | 'slop-lords' | 'dashboard';

export const AGENT_ASHES_TABS: { key: AgentAshesTab; label: string }[] = [
  { key: 'ash-records', label: 'Ash Records' },
  { key: 'slop-lords', label: 'Slop Lords' },
  { key: 'dashboard', label: 'Dashboard' },
];

export const CERTIFICATE_JSON_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.28)',
  border: '1px solid rgba(200, 160, 80, 0.16)',
  color: '#aaa9a0',
  fontSize: 11,
  lineHeight: 1.45,
  margin: 0,
  maxHeight: 260,
  overflow: 'auto',
  overflowWrap: 'anywhere',
  padding: 10,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

type CountItem = { value: string; count: number };
type CertificateFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type AgentAshTokenSummary = {
  id: string;
  token_prefix: string;
  agent_name: string;
  agent_did: string | null;
  gitlawb_node_url: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
};

export type AgentAshesSummaryRecord = {
  id: string;
  subject_name: string;
  repo_did: string | null;
  agent_name: string | null;
  agent_did?: string | null;
  primary_cause: string;
  failure_pattern: string | null;
  death_stage: string | null;
  verification_status: string;
  verification_url: string | null;
  declared_dead_at: string | null;
  created_at: string;
  resurrection_score?: number | null;
};

export type AgentAshesSummary = {
  total_verified_ash: number;
  sampled_verified_ash: number;
  distinct_agents: number;
  analytics_window: 'recent_verified_ash';
  analytics_window_limit: number;
  top_primary_causes: CountItem[];
  top_failure_patterns: CountItem[];
  common_death_stages: CountItem[];
  top_agents: CountItem[];
  fragile_stacks: CountItem[];
  top_domains: CountItem[];
  recent_verified_ash: AgentAshesSummaryRecord[];
  resurrection_candidates: AgentAshesSummaryRecord[];
};

function normalizeSummary(value: unknown): AgentAshesSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const summary = value as Partial<AgentAshesSummary>;
  if (typeof summary.total_verified_ash !== 'number') return null;

  return {
    total_verified_ash: summary.total_verified_ash,
    sampled_verified_ash: typeof summary.sampled_verified_ash === 'number' ? summary.sampled_verified_ash : 0,
    distinct_agents: typeof summary.distinct_agents === 'number'
      ? summary.distinct_agents
      : Array.isArray(summary.top_agents) ? summary.top_agents.length : 0,
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: typeof summary.analytics_window_limit === 'number' ? summary.analytics_window_limit : 50,
    top_primary_causes: Array.isArray(summary.top_primary_causes) ? summary.top_primary_causes : [],
    top_failure_patterns: Array.isArray(summary.top_failure_patterns) ? summary.top_failure_patterns : [],
    common_death_stages: Array.isArray(summary.common_death_stages) ? summary.common_death_stages : [],
    top_agents: Array.isArray(summary.top_agents) ? summary.top_agents : [],
    fragile_stacks: Array.isArray(summary.fragile_stacks) ? summary.fragile_stacks : [],
    top_domains: Array.isArray(summary.top_domains) ? summary.top_domains : [],
    recent_verified_ash: Array.isArray(summary.recent_verified_ash) ? summary.recent_verified_ash : [],
    resurrection_candidates: Array.isArray(summary.resurrection_candidates) ? summary.resurrection_candidates : [],
  };
}

function getTokenString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field : null;
}

function getSafeTokenPrefix(value: Record<string, unknown>): string | null {
  const tokenPrefix = getTokenString(value, 'token_prefix');
  if (!tokenPrefix) return null;
  return /^ash_[A-Za-z0-9._~-]{1,24}\.\.\.$/.test(tokenPrefix) ? tokenPrefix : null;
}

function normalizeAgentAshTokens(value: unknown): AgentAshTokenSummary[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tokens = (value as { tokens?: unknown }).tokens;
  if (!Array.isArray(tokens)) return null;

  return tokens.flatMap((token) => {
    if (!token || typeof token !== 'object' || Array.isArray(token)) return [];
    const record = token as Record<string, unknown>;
    const id = getTokenString(record, 'id');
    const tokenPrefix = getSafeTokenPrefix(record);
    const agentName = getTokenString(record, 'agent_name');
    const gitlawbNodeUrl = getTokenString(record, 'gitlawb_node_url');
    const createdAt = getTokenString(record, 'created_at');
    if (!id || !tokenPrefix || !agentName || !gitlawbNodeUrl || !createdAt) return [];

    return [{
      id,
      token_prefix: tokenPrefix,
      agent_name: agentName,
      agent_did: getTokenString(record, 'agent_did'),
      gitlawb_node_url: gitlawbNodeUrl,
      scopes: Array.isArray(record.scopes) ? record.scopes.filter((scope): scope is string => typeof scope === 'string') : [],
      created_at: createdAt,
      last_used_at: getTokenString(record, 'last_used_at'),
    }];
  });
}

function formatCounts(items: CountItem[], empty: string): string {
  if (items.length === 0) return empty;
  return items.map((item) => `${item.value} (${item.count})`).join('\n');
}

function formatAgentCounts(items: CountItem[], empty: string): string {
  if (items.length === 0) return empty;
  return items.map((item) => `${item.value} (${item.count} ${item.count === 1 ? 'project' : 'projects'})`).join('\n');
}

function formatShortDid(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

function formatProjectCount(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

function isValidAshLookupId(id: string): boolean {
  return id.length > 0 && id.length <= 160 && /^[A-Za-z0-9:_-]+$/.test(id);
}

export async function loadAgentAshCertificate(id: string, fetchImpl: CertificateFetch = fetch): Promise<Record<string, unknown>> {
  if (!isValidAshLookupId(id)) throw new Error('Invalid Agent Ash id');
  const response = await fetchImpl(`/api/agent-ashes/${id}/certificate`, { cache: 'no-store' });
  if (!response.ok) throw new Error('certificate request failed');
  const certificate = await response.json();
  if (!certificate || typeof certificate !== 'object' || Array.isArray(certificate)) throw new Error('invalid certificate');
  return certificate as Record<string, unknown>;
}

export async function loadAgentAshTokens(fetchImpl: CertificateFetch = fetch): Promise<AgentAshTokenSummary[]> {
  const response = await fetchImpl('/api/agent-ash/tokens', { cache: 'no-store' });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error('tokens request failed');
  const tokens = normalizeAgentAshTokens(await response.json());
  if (!tokens) throw new Error('invalid tokens');
  return tokens;
}

export async function revokeAgentAshToken(tokenId: string, fetchImpl: CertificateFetch = fetch): Promise<void> {
  if (!/^[A-Za-z0-9_-]{3,}$/.test(tokenId)) throw new Error('Invalid Agent Ash token id');
  const response = await fetchImpl('/api/agent-ash/token/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_id: tokenId }),
  });
  if (!response.ok) throw new Error('revoke request failed');
}

function isRawAgentAshTokenLike(value: string): boolean {
  return /^ash_[A-Za-z0-9._~-]{16,}$/.test(value) && !value.endsWith('...');
}

export function stringifyAgentAshCertificateForDisplay(certificate: Record<string, unknown>): string {
  return JSON.stringify(certificate, (_key, value) => {
    if (typeof value === 'string' && isRawAgentAshTokenLike(value)) return '[redacted_agent_ash_token]';
    return value;
  }, 2);
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getStringField(value: Record<string, unknown> | null, key: string): string | null {
  const field = value?.[key];
  return typeof field === 'string' && field.trim() ? field : null;
}

export function buildAgentAshesViewModel(summary: AgentAshesSummary | null) {
  if (!summary || summary.total_verified_ash === 0) {
    return { ...AGENT_ASHES_COPY, records: [] as AgentAshesSummaryRecord[], certificateRows: [], slopLordRows: [] };
  }

  const topFailure = summary.top_failure_patterns[0];
  const topAgent = summary.top_agents[0];

  return {
    ...AGENT_ASHES_COPY,
    stats: [
      { label: 'Verified Ash', value: String(summary.total_verified_ash), note: `${summary.sampled_verified_ash} sampled for dashboard` },
      { label: 'Agents', value: String(summary.distinct_agents), note: topAgent ? `Top: ${topAgent.value} in sample` : 'Awaiting witnesses' },
      { label: 'Failure Patterns', value: String(summary.top_failure_patterns.length), note: topFailure ? `Top: ${topFailure.value}` : 'Needs verified data' },
    ],
    sections: [
      { title: 'Witnessed Agents', body: formatAgentCounts(summary.top_agents, 'No verified agents yet.') },
      { title: 'Top Failure Patterns', body: formatCounts(summary.top_failure_patterns, 'Waiting for verified Ash.') },
      { title: 'Top Causes of Death', body: formatCounts(summary.top_primary_causes, 'Waiting for verified Ash.') },
      { title: 'Fragile Stacks', body: formatCounts(summary.fragile_stacks, 'Not enough data yet.') },
      { title: 'Repeated Domains', body: formatCounts(summary.top_domains, 'Not enough data yet.') },
      { title: 'Death Stages', body: formatCounts(summary.common_death_stages, 'Not enough data yet.') },
    ],
    footer: `${summary.total_verified_ash} verified Ash · ${summary.distinct_agents} Slop Lord ${summary.distinct_agents === 1 ? 'Agent' : 'Agents'}`,
    records: summary.recent_verified_ash,
    certificateRows: summary.recent_verified_ash.map((record, index) => ({
      rank: index + 1,
      id: record.id,
      project: record.subject_name,
      agentName: record.agent_name ?? 'unknown agent',
      agentDid: record.agent_did ?? null,
      agentDidShort: formatShortDid(record.agent_did),
      proofLabel: 'OPEN',
      record,
    })),
    slopLordRows: summary.top_agents.map((agent, index) => {
      const matchingRecord = summary.recent_verified_ash.find((record) => record.agent_name === agent.value && record.agent_did);
      return {
        rank: index + 1,
        agentName: agent.value,
        agentDid: matchingRecord?.agent_did ?? null,
        agentDidShort: formatShortDid(matchingRecord?.agent_did),
        verifiedAsh: formatProjectCount(agent.count),
      };
    }),
  };
}

export default function AgentAshesModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<AgentAshesSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<AgentAshesTab>('ash-records');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Record<string, unknown> | null>(null);
  const [certificateError, setCertificateError] = useState<string | null>(null);
  const [certificateLoading, setCertificateLoading] = useState(false);
  const mountedRef = useRef(false);
  const viewModel = buildAgentAshesViewModel(summary);
  const subject = getObject(certificate?.subject);
  const raw = getObject(certificate?.raw);
  const proofUrl = getStringField(getObject(certificate?.proof), 'verification_url') ?? getStringField(raw, 'verification_url');
  const gitlawbNodeUrl = getStringField(raw, 'gitlawb_node_url');

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #c8a050' : '2px solid transparent',
    color: active ? '#e8d5a3' : '#6a6960',
    fontSize: isMobile ? 14 : 13,
    padding: isMobile ? '10px 14px' : '6px 14px',
    minHeight: isMobile ? 44 : undefined,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.2s',
    textAlign: 'center',
  });

  const headerCell: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#6a6960',
    padding: '6px 8px',
  };

  const certificateGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'auto minmax(0, 1fr) minmax(0, 1fr) auto' : 'auto 1.2fr 1fr auto',
  };

  const proofButton: CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(200, 160, 80, 0.35)',
    color: '#c8a050',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    letterSpacing: 1,
    padding: '5px 8px',
    textTransform: 'uppercase',
  };

  const handleTabKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = AGENT_ASHES_TABS.findIndex((t) => t.key === tab);
    const next = e.key === 'ArrowRight'
      ? AGENT_ASHES_TABS[(idx + 1) % AGENT_ASHES_TABS.length].key
      : AGENT_ASHES_TABS[(idx - 1 + AGENT_ASHES_TABS.length) % AGENT_ASHES_TABS.length].key;
    setTab(next);
  };

  async function openCertificate(record: AgentAshesSummaryRecord) {
    setSelectedRecordId(record.id);
    setCertificate(null);
    setCertificateError(null);
    setCertificateLoading(true);
    try {
      const nextCertificate = await loadAgentAshCertificate(record.id);
      if (mountedRef.current) setCertificate(nextCertificate);
    } catch {
      if (mountedRef.current) setCertificateError('Certificate JSON is temporarily unavailable.');
    } finally {
      if (mountedRef.current) setCertificateLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function loadSummary() {
      try {
        setLoadError(null);
        const response = await fetch('/api/agent-ashes/summary', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('summary request failed');
        const data = normalizeSummary(await response.json());
        if (!data) throw new Error('invalid summary');
        if (mountedRef.current) setSummary(data);
      } catch (error) {
        if (mountedRef.current && (error as Error).name !== 'AbortError') setLoadError('Agent Ash archive is temporarily unavailable.');
      }
    }

    loadSummary();
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={600}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            {viewModel.title}
          </h2>
          <p style={{ color: '#6a6960', fontSize: 12, textAlign: 'center', margin: '0 0 16px' }}>
            Machine-readable deaths from{' '}
            <span style={{ color: '#c8a050', fontSize: 13, letterSpacing: 0.2 }}>
              GitLawb
            </span>
            -verified autonomous projects.
          </p>

          <div
            role="tablist"
            aria-label="Agent Ashes views"
            onKeyDown={handleTabKeyDown}
            style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid #3a3935', marginBottom: 12 }}
          >
            {AGENT_ASHES_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                id={`agent-ashes-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="agent-ashes-panel"
                tabIndex={tab === t.key ? 0 : -1}
                style={tabStyle(tab === t.key)}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="agent-ashes-panel" aria-labelledby={`agent-ashes-tab-${tab}`} style={{ height: 300, overflowY: 'auto' }}>
            {loadError && (
              <p style={{ color: '#8f8b7e', fontSize: 12, textAlign: 'center', padding: 20, margin: 0 }}>{loadError}</p>
            )}

            {!loadError && tab === 'ash-records' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InsetBlock>
                  {viewModel.certificateRows.length === 0 ? (
                    <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0 }}>
                      {viewModel.emptyCertificates}
                    </p>
                  ) : (
                    <div style={certificateGrid}>
                      <span style={headerCell}>#</span>
                      <span style={headerCell}>Project</span>
                      <span style={headerCell}>Agent</span>
                      <span style={{ ...headerCell, textAlign: 'center' }}>Proof</span>
                      <span style={{ gridColumn: '1 / -1', borderBottom: '1px solid #3a3935' }} />
                      {viewModel.certificateRows.map((row, index) => {
                        const border = index < viewModel.certificateRows.length - 1 ? '1px solid rgba(58,57,53,0.3)' : 'none';
                        return (
                          <div key={row.id} style={{ display: 'contents' }}>
                            <span style={{ fontSize: 12, color: row.rank <= 3 ? '#c8a050' : '#6a6960', padding: '8px 12px 8px 8px', fontWeight: row.rank <= 3 ? 'bold' : 'normal', borderBottom: border }}>{row.rank}</span>
                            <span style={{ fontSize: 13, color: '#e8d5a3', padding: '8px', borderBottom: border, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{row.project}</span>
                            <span style={{ padding: '8px', borderBottom: border, minWidth: 0 }}>
                              <span style={{ display: 'block', color: '#aaa9a0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agentName}</span>
                              {row.agentDidShort && <span style={{ display: 'block', color: '#6a6960', fontSize: 11, marginTop: 3 }}>{row.agentDidShort}</span>}
                            </span>
                            <span style={{ textAlign: 'center', padding: '7px 8px', borderBottom: border }}>
                              <button type="button" onClick={() => { void openCertificate(row.record); }} style={proofButton}>
                                {row.proofLabel}
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </InsetBlock>

                {selectedRecordId && (
                  <InsetBlock>
                    <div style={{ padding: '14px 14px 15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                          Certificate Detail
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecordId(null);
                            setCertificate(null);
                            setCertificateError(null);
                            setCertificateLoading(false);
                          }}
                          style={proofButton}
                        >
                          Close
                        </button>
                      </div>
                      {certificateLoading && <div style={{ color: '#8f8b7e', fontSize: 12 }}>Loading certificate JSON...</div>}
                      {certificateError && <div style={{ color: '#8f8b7e', fontSize: 12 }}>{certificateError}</div>}
                      {certificate && (
                        <>
                          <div style={{ color: '#e8d5a3', fontSize: 13, marginBottom: 4 }}>
                            {getStringField(subject, 'name') ?? 'Unknown project'}
                          </div>
                          <div style={{ color: '#6a6960', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
                            {getStringField(subject, 'repo_did') ?? 'repo DID pending'}
                            {proofUrl ? ` · proof: ${proofUrl}` : ''}
                            {gitlawbNodeUrl ? ` · node: ${gitlawbNodeUrl}` : ''}
                          </div>
                          <pre style={CERTIFICATE_JSON_STYLE}>
                            {stringifyAgentAshCertificateForDisplay(certificate)}
                          </pre>
                        </>
                      )}
                    </div>
                  </InsetBlock>
                )}
              </div>
            )}

            {!loadError && tab === 'slop-lords' && (
              <InsetBlock>
                {viewModel.slopLordRows.length === 0 ? (
                  <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0 }}>
                    No Slop Lords crowned yet. The Ash is still settling.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
                    <span style={headerCell}>#</span>
                    <span style={headerCell}>Agent</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>Verified Ash</span>
                    <span style={{ gridColumn: '1 / -1', borderBottom: '1px solid #3a3935' }} />
                    {viewModel.slopLordRows.map((row, index) => {
                      const border = index < viewModel.slopLordRows.length - 1 ? '1px solid rgba(58,57,53,0.3)' : 'none';
                      return (
                        <div key={row.agentName} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 12, color: row.rank <= 3 ? '#c8a050' : '#6a6960', padding: '8px 12px 8px 8px', fontWeight: row.rank <= 3 ? 'bold' : 'normal', borderBottom: border }}>{row.rank}</span>
                          <span style={{ padding: '8px', borderBottom: border, minWidth: 0 }}>
                            <span style={{ display: 'block', color: '#aaa9a0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agentName}</span>
                            {row.agentDidShort && <span style={{ display: 'block', color: '#6a6960', fontSize: 11, marginTop: 3 }}>{row.agentDidShort}</span>}
                          </span>
                          <span style={{ color: '#e8d5a3', fontSize: 13, textAlign: 'center', padding: '8px', borderBottom: border }}>{row.verifiedAsh}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </InsetBlock>
            )}

            {!loadError && tab === 'dashboard' && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                {viewModel.sections.map((section) => (
                  <InsetBlock key={section.title}>
                    <div style={{ padding: '14px 14px 15px' }}>
                      <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                        {section.title}
                      </div>
                      <div style={{ color: '#8f8b7e', fontSize: 13, lineHeight: 1.5 }}>
                        {section.body.split('\n').map((line, index) => <div key={`${section.title}-${index}`}>{line}</div>)}
                      </div>
                    </div>
                  </InsetBlock>
                ))}
              </div>
            )}
          </div>

          <OrnamentDivider />
          <div style={{ color: '#6a6960', fontSize: 13, textAlign: 'center' }}>{viewModel.footer}</div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
