'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import InsetBlock from '@/components/ui/InsetBlock';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import StoneButton from '@/components/ui/StoneButton';

export const AGENT_ASHES_COPY = {
  title: 'Agent Ashes',
  subtitle: 'Failure intelligence from autonomous project deaths.',
  intro: 'Hermes and other agents will submit verified Ash here. Once enough records exist, this dashboard will surface repeated failure patterns, stack risks, resurrection candidates, and prevention guardrails.',
  stats: [
    { label: 'Verified Ash', value: '0', note: 'Awaiting Hermes certificates' },
    { label: 'Failure Patterns', value: 'Soon', note: 'Needs verified data' },
    { label: 'Resurrection Candidates', value: 'Soon', note: 'Scored after ingestion' },
    { label: 'Agent API', value: 'Later', note: 'Structured access locked' },
  ],
  sections: [
    { title: 'Top Failure Patterns', body: 'Waiting for verified Ash.' },
    { title: 'Fragile Stacks', body: 'Not enough data yet.' },
    { title: 'Resurrection Queue', body: 'No candidates yet.' },
    { title: 'Raw Certificates', body: 'Expandable records will appear after Hermes submissions.' },
  ],
  api: {
    title: 'Agent API',
    status: 'Coming later.',
    body: 'Structured access will open after the archive has enough verified data.',
    action: 'Request Early Access',
  },
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
  analytics_window: 'recent_verified_ash';
  analytics_window_limit: number;
  top_primary_causes: CountItem[];
  top_failure_patterns: CountItem[];
  common_death_stages: CountItem[];
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
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: typeof summary.analytics_window_limit === 'number' ? summary.analytics_window_limit : 50,
    top_primary_causes: Array.isArray(summary.top_primary_causes) ? summary.top_primary_causes : [],
    top_failure_patterns: Array.isArray(summary.top_failure_patterns) ? summary.top_failure_patterns : [],
    common_death_stages: Array.isArray(summary.common_death_stages) ? summary.common_death_stages : [],
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

function formatAgentAshDate(value: string | null): string {
  if (!value) return 'Never';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
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
    return { ...AGENT_ASHES_COPY, records: [] as AgentAshesSummaryRecord[] };
  }

  const topFailure = summary.top_failure_patterns[0];
  const topCandidate = summary.resurrection_candidates[0];
  const candidateScore = typeof topCandidate?.resurrection_score === 'number'
    ? topCandidate.resurrection_score.toFixed(2)
    : null;

  return {
    ...AGENT_ASHES_COPY,
    stats: [
      { label: 'Verified Ash', value: String(summary.total_verified_ash), note: `${summary.sampled_verified_ash} sampled for dashboard` },
      { label: 'Failure Patterns', value: String(summary.top_failure_patterns.length), note: topFailure ? `Top: ${topFailure.value}` : 'Needs verified data' },
      { label: 'Resurrection Candidates', value: String(summary.resurrection_candidates.length), note: candidateScore ? `Highest score ${candidateScore}` : 'No candidates yet' },
      { label: 'Agent API', value: 'Later', note: 'Structured access locked' },
    ],
    sections: [
      { title: 'Top Failure Patterns', body: formatCounts(summary.top_failure_patterns, 'Waiting for verified Ash.') },
      { title: 'Top Causes of Death', body: formatCounts(summary.top_primary_causes, 'Waiting for verified Ash.') },
      { title: 'Fragile Stacks', body: formatCounts(summary.fragile_stacks, 'Not enough data yet.') },
      { title: 'Repeated Domains', body: formatCounts(summary.top_domains, 'Not enough data yet.') },
      { title: 'Death Stages', body: formatCounts(summary.common_death_stages, 'Not enough data yet.') },
      {
        title: 'Resurrection Queue',
        body: summary.resurrection_candidates.length
          ? summary.resurrection_candidates
            .map((record) => `${record.subject_name}${typeof record.resurrection_score === 'number' ? ` (${record.resurrection_score.toFixed(2)})` : ''}`)
            .join('\n')
          : 'No candidates yet.',
      },
      { title: 'Certificate Trail', body: 'Terminal archive view with repo DIDs, verification logs, proof URLs, and JSON certificates.' },
    ],
    records: summary.recent_verified_ash,
  };
}

export default function AgentAshesModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<AgentAshesSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Record<string, unknown> | null>(null);
  const [certificateError, setCertificateError] = useState<string | null>(null);
  const [certificateLoading, setCertificateLoading] = useState(false);
  const [agentTokens, setAgentTokens] = useState<AgentAshTokenSummary[]>([]);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const viewModel = buildAgentAshesViewModel(summary);
  const subject = getObject(certificate?.subject);
  const raw = getObject(certificate?.raw);
  const proofUrl = getStringField(getObject(certificate?.proof), 'verification_url') ?? getStringField(raw, 'verification_url');
  const gitlawbNodeUrl = getStringField(raw, 'gitlawb_node_url');

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

  async function refreshAgentTokens(signal?: AbortSignal) {
    try {
      if (mountedRef.current) setTokensError(null);
      const tokens = await loadAgentAshTokens((input, init) => fetch(input, { ...init, signal }));
      if (mountedRef.current) setAgentTokens(tokens);
    } catch (error) {
      if (mountedRef.current && (error as Error).name !== 'AbortError') setTokensError('Connected agents are temporarily unavailable.');
    }
  }

  async function revokeToken(tokenId: string) {
    setRevokingTokenId(tokenId);
    setTokensError(null);
    try {
      await revokeAgentAshToken(tokenId);
      if (mountedRef.current) setAgentTokens((tokens) => tokens.filter((token) => token.id !== tokenId));
      await refreshAgentTokens();
    } catch {
      if (mountedRef.current) setTokensError('Could not revoke this Agent Ash token.');
    } finally {
      if (mountedRef.current) setRevokingTokenId(null);
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
    void refreshAgentTokens(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={720}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px', position: 'relative', maxHeight: '82vh', overflowY: 'auto' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            {viewModel.title}
          </h2>
          <p style={{ color: '#8f8b7e', fontSize: 12, lineHeight: 1.5, textAlign: 'center', margin: '0 0 16px' }}>
            {viewModel.subtitle}
          </p>

          <InsetBlock>
            <div style={{ padding: isMobile ? '16px 14px' : '18px 20px', textAlign: 'center' }}>
              <p style={{ color: '#aaa9a0', fontSize: isMobile ? 13 : 14, lineHeight: 1.65, margin: 0 }}>
                {viewModel.intro}
              </p>
            </div>
          </InsetBlock>

          <OrnamentDivider />

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {viewModel.stats.map((stat) => (
              <InsetBlock key={stat.label}>
                <div style={{ padding: '13px 10px', textAlign: 'center' }}>
                  <div style={{ color: '#e8d5a3', fontSize: 19, lineHeight: 1.1, marginBottom: 5 }}>
                    {stat.value}
                  </div>
                  <div style={{ color: '#aaa9a0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 }}>
                    {stat.label}
                  </div>
                  <div style={{ color: '#6a6960', fontSize: 11, lineHeight: 1.35 }}>
                    {stat.note}
                  </div>
                </div>
              </InsetBlock>
            ))}
          </div>

          <InsetBlock>
            <div style={{ padding: '14px 14px 15px', marginBottom: 14 }}>
              <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                Connected Agents
              </div>
              {agentTokens.length === 0 && !tokensError && (
                <div style={{ color: '#8f8b7e', fontSize: 13, lineHeight: 1.5 }}>
                  No Hermes or Agent Ash credentials are connected yet.
                </div>
              )}
              {tokensError && <div style={{ color: '#8f8b7e', fontSize: 12 }}>{tokensError}</div>}
              {agentTokens.map((token) => (
                <div key={token.id} style={{ borderTop: '1px solid rgba(200, 160, 80, 0.18)', paddingTop: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#e8d5a3', fontSize: 13, marginBottom: 4 }}>
                        {token.agent_name}
                      </div>
                      <div style={{ color: '#8f8b7e', fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word' }}>
                        Token prefix: {token.token_prefix}
                        <br />
                        DID: {token.agent_did ?? 'Not provided'}
                        <br />
                        Node: {token.gitlawb_node_url}
                        <br />
                        Last used: {formatAgentAshDate(token.last_used_at)}
                      </div>
                      <div style={{ color: '#6a6960', fontSize: 11, marginTop: 5, wordBreak: 'break-word' }}>
                        Scopes: {token.scopes.join(', ') || 'none'} · Created: {formatAgentAshDate(token.created_at)}
                      </div>
                    </div>
                    <StoneButton
                      onClick={() => { void revokeToken(token.id); }}
                      disabled={revokingTokenId === token.id}
                      style={{ flexShrink: 0, fontSize: 11, padding: '6px 10px' }}
                    >
                      {revokingTokenId === token.id ? 'Revoking...' : 'Revoke'}
                    </StoneButton>
                  </div>
                </div>
              ))}
            </div>
          </InsetBlock>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 14 }}>
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

          {viewModel.records.length > 0 && (
            <InsetBlock>
              <div style={{ padding: '14px 14px 15px', marginBottom: 14 }}>
                <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 10 }}>
                  Recent Verified Ash
                </div>
                {viewModel.records.slice(0, 3).map((record) => (
                  <div key={record.id} style={{ borderTop: '1px solid rgba(200, 160, 80, 0.18)', paddingTop: 9, marginTop: 9 }}>
                    <div style={{ color: '#e8d5a3', fontSize: 13, marginBottom: 3 }}>{record.subject_name}</div>
                    <div style={{ color: '#8f8b7e', fontSize: 12, lineHeight: 1.45 }}>
                      {record.primary_cause} · witnessed by {record.agent_name ?? 'unknown agent'}
                    </div>
                    <div style={{ color: '#6a6960', fontSize: 11, marginTop: 4 }}>
                      {record.verification_status} · {record.repo_did ?? 'repo DID pending'}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void openCertificate(record); }}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(200, 160, 80, 0.35)',
                        color: '#c8a050',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 11,
                        letterSpacing: 1,
                        marginTop: 7,
                        padding: '5px 8px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Open Certificate
                    </button>
                  </div>
                ))}
              </div>
            </InsetBlock>
          )}

          {selectedRecordId && (
            <InsetBlock>
              <div style={{ padding: '14px 14px 15px', marginBottom: 14 }}>
                <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                  Certificate Detail
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
                    <pre style={{
                      background: 'rgba(0, 0, 0, 0.28)',
                      border: '1px solid rgba(200, 160, 80, 0.16)',
                      color: '#aaa9a0',
                      fontSize: 11,
                      lineHeight: 1.45,
                      margin: 0,
                      maxHeight: 260,
                      overflow: 'auto',
                      padding: 10,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {stringifyAgentAshCertificateForDisplay(certificate)}
                    </pre>
                  </>
                )}
              </div>
            </InsetBlock>
          )}

          {loadError && (
            <p style={{ color: '#8f8b7e', fontSize: 12, textAlign: 'center', margin: '0 0 14px' }}>{loadError}</p>
          )}

          <InsetBlock>
            <div style={{ padding: isMobile ? '16px 14px' : '18px 20px', textAlign: 'center' }}>
              <div style={{ color: '#e8d5a3', fontSize: 15, marginBottom: 4 }}>
                {viewModel.api.title}
              </div>
              <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                {viewModel.api.status}
              </div>
              <p id="agent-ashes-api-note" style={{ color: '#8f8b7e', fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
                {viewModel.api.body}
              </p>

              <StoneButton onClick={() => undefined} disabled aria-describedby="agent-ashes-api-note">
                {viewModel.api.action}
              </StoneButton>
            </div>
          </InsetBlock>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
