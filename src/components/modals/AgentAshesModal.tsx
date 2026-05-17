'use client';

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

export default function AgentAshesModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={720}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px', position: 'relative', maxHeight: '82vh', overflowY: 'auto' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            {AGENT_ASHES_COPY.title}
          </h2>
          <p style={{ color: '#8f8b7e', fontSize: 12, lineHeight: 1.5, textAlign: 'center', margin: '0 0 16px' }}>
            {AGENT_ASHES_COPY.subtitle}
          </p>

          <InsetBlock>
            <div style={{ padding: isMobile ? '16px 14px' : '18px 20px', textAlign: 'center' }}>
              <p style={{ color: '#aaa9a0', fontSize: isMobile ? 13 : 14, lineHeight: 1.65, margin: 0 }}>
                {AGENT_ASHES_COPY.intro}
              </p>
            </div>
          </InsetBlock>

          <OrnamentDivider />

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {AGENT_ASHES_COPY.stats.map((stat) => (
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

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {AGENT_ASHES_COPY.sections.map((section) => (
              <InsetBlock key={section.title}>
                <div style={{ padding: '14px 14px 15px' }}>
                  <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                    {section.title}
                  </div>
                  <div style={{ color: '#8f8b7e', fontSize: 13, lineHeight: 1.5 }}>
                    {section.body}
                  </div>
                </div>
              </InsetBlock>
            ))}
          </div>

          <InsetBlock>
            <div style={{ padding: isMobile ? '16px 14px' : '18px 20px', textAlign: 'center' }}>
              <div style={{ color: '#e8d5a3', fontSize: 15, marginBottom: 4 }}>
                {AGENT_ASHES_COPY.api.title}
              </div>
              <div style={{ color: '#c8a050', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
                {AGENT_ASHES_COPY.api.status}
              </div>
              <p id="agent-ashes-api-note" style={{ color: '#8f8b7e', fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
                {AGENT_ASHES_COPY.api.body}
              </p>

              <StoneButton onClick={() => undefined} disabled aria-describedby="agent-ashes-api-note">
                {AGENT_ASHES_COPY.api.action}
              </StoneButton>
            </div>
          </InsetBlock>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
