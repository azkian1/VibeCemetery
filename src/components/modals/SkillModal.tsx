'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';
import {
  detectSkillPlatform,
  getSkillInstallCommand,
  getSkillInstallSecondaryLink,
  getSkillPlatformLabels,
  type SkillPlatform,
} from './skillInstall';

export default function SkillModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<SkillPlatform>(() => {
    if (typeof window === 'undefined') return 'macOS';
    return detectSkillPlatform(window.navigator.platform);
  });

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  if (isMobile) return null;

  const command = getSkillInstallCommand(selectedPlatform);
  const platforms = getSkillPlatformLabels();

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy this command:', command);
    });
  };

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 14px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            Install /bury
          </h2>

          <p style={{ fontSize: 13, color: '#aaa9a0', margin: '0 0 18px', lineHeight: 1.55, textAlign: 'center' }}>
            <code style={{ color: '#c8a050' }}>/bury</code> cremates dead local projects from Claude Code.
            It scans local folders only, does not scan GitHub accounts, and does not create map graves.
            First run opens browser approval once, then the CLI stores a local token for later runs.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
            {platforms.map((platform) => {
              const active = platform === selectedPlatform;

              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setSelectedPlatform(platform)}
                  style={{
                    border: '1px solid rgba(200,160,80,0.35)',
                    background: active ? 'rgba(200,160,80,0.16)' : 'rgba(20,18,14,0.72)',
                    color: active ? '#f1e1bb' : '#aaa9a0',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    minWidth: 92,
                  }}
                >
                  {platform}
                </button>
              );
            })}
          </div>

          <div style={{ marginBottom: 16 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <code
                  style={{
                    fontSize: 12,
                    color: '#c8a050',
                    fontFamily: "'Consolas', 'Monaco', monospace",
                    textAlign: 'left',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {command}
                </code>
                <StoneButton onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy install command'}
                </StoneButton>
              </div>
            </InsetBlock>
          </div>

          <p style={{ fontSize: 12, color: '#6f6c63', margin: '0 0 16px', lineHeight: 1.5, textAlign: 'center' }}>
            Run this in your terminal, then restart Claude Code and use <code style={{ color: '#c8a050' }}>/bury</code>.
          </p>

          <ul
            style={{
              margin: '0 0 16px',
              paddingLeft: 20,
              fontSize: 12,
              color: '#6a6960',
              lineHeight: 1.6,
              listStyle: 'none',
              padding: 0,
              textAlign: 'center',
            }}
          >
            <li>Public GitHub script</li>
            <li>Installs only `bury.md` and `bury-workflow/`</li>
            <li>Replacement-safe on rerun</li>
          </ul>

          <div style={{ textAlign: 'center' }}>
            <a
              href={getSkillInstallSecondaryLink()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#7898b8',
                fontSize: 13,
                textDecoration: 'none',
                borderBottom: '1px solid rgba(120,152,184,0.3)',
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#90b0d0';
                e.currentTarget.style.borderColor = '#90b0d0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#7898b8';
                e.currentTarget.style.borderColor = 'rgba(120,152,184,0.3)';
              }}
            >
              Manual install on GitHub ↗
            </a>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
