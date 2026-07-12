'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChat, useGame } from '@/context/GameContext';
import type { ChatMessage } from '@/context/GameContext';
import {
  GRAVEDIGGER_GREETING,
  GRAVEDIGGER_IDLE,
} from '@/gravedigger/phrases';
import { generateFromGrave } from '@/gravedigger/fillTemplate';
import { useIsMobile } from '@/hooks/useIsMobile';

const MESSAGE_COLORS: Record<ChatMessage['type'], string> = {
  system: '#8a8980',
  gravedigger: '#e8d5a3',
  burial: '#68a060',
  stat: '#a0a0d0',
};

const MESSAGE_PREFIXES: Partial<Record<ChatMessage['type'], string>> = {
  gravedigger: 'Gravedigger: ',
};

export const CHAT_STATUS_ITEMS = [
  { key: 'total', label: 'Total', emoji: '💀' },
  { key: 'buried', label: 'Buried', emoji: '🪦' },
  { key: 'cremated', label: 'Cremated', emoji: '🔥' },
];

export function getChatStatusCounts({
  graveCount,
  crematedCount,
}: {
  graveCount: number;
  crematedCount: number;
}): { total: number; buried: number; cremated: number } {
  return {
    total: graveCount + crematedCount,
    buried: graveCount,
    cremated: crematedCount,
  };
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hasNonAscii(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

export default function ChatLog() {
  const isMobile = useIsMobile();
  const { messages, addMessage } = useChat();
  const { state } = useGame();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const statusCounts = getChatStatusCounts({ graveCount: state.graves.size, crematedCount: state.cremated.length });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const lastIdleIndexRef = useRef(-1);
  const lastGravediggerTimeRef = useRef(0);
  const messagesRef = useRef(messages);
  const stateRef = useRef(state);
  const systemGreetingAddedRef = useRef(false);
  const gravediggerGreetingSentRef = useRef(false);

  // Keep refs in sync without resetting idle timer
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // On mount: system greeting + gravedigger greeting (skip on mobile)
  useEffect(() => {
    if (isMobile) return;

    if (!systemGreetingAddedRef.current) {
      systemGreetingAddedRef.current = true;
      addMessage({
        id: crypto.randomUUID(),
        type: 'system',
        text: 'Connecting to the cemetery...',
        timestamp: Date.now(),
      });
    }

    if (gravediggerGreetingSentRef.current) return;

    const greetingTimer = setTimeout(() => {
      gravediggerGreetingSentRef.current = true;
      addMessage({
        id: crypto.randomUUID(),
        type: 'gravedigger',
        text: pickRandom(GRAVEDIGGER_GREETING),
        timestamp: Date.now(),
      });
    }, 1200);

    return () => clearTimeout(greetingTimer);
  }, [addMessage, isMobile]);

  // Idle timer: random gravedigger phrase every ~75s (skip on mobile)
  useEffect(() => {
    if (isMobile) return;
    let timeout: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const delay = 70000 + Math.random() * 10000;
      timeout = setTimeout(() => {
        const msgs = messagesRef.current;

        // Anti-spam: skip if last 3 messages are all burial/gravedigger (batch in progress)
        const recent = msgs.slice(-3);
        if (recent.length === 3 && recent.every(m => m.type === 'burial' || m.type === 'gravedigger') && recent.some(m => m.type === 'burial')) {
          scheduleNext();
          return;
        }

        // Skip if a burial message arrived within last 10s
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.type === 'burial' && Date.now() - lastMsg.timestamp < 10000) {
          scheduleNext();
          return;
        }

        // Cooldown: at least 10s since last gravedigger message
        if (Date.now() - lastGravediggerTimeRef.current < 10000) {
          scheduleNext();
          return;
        }

        // 50% chance: dynamic template from real cemetery data
        let text: string | null = null;
        const s = stateRef.current;
        if (Math.random() < 0.5 && (s.graves.size > 0 || s.cremated.length > 0)) {
          text = generateFromGrave(s.graves, s.cremated);
        }

        // Fallback: static phrase
        if (!text || hasNonAscii(text)) {
          let idx: number;
          do {
            idx = Math.floor(Math.random() * GRAVEDIGGER_IDLE.length);
          } while (idx === lastIdleIndexRef.current && GRAVEDIGGER_IDLE.length > 1);
          lastIdleIndexRef.current = idx;
          text = GRAVEDIGGER_IDLE[idx];
        }

        lastGravediggerTimeRef.current = Date.now();

        addMessage({
          id: crypto.randomUUID(),
          type: 'gravedigger',
          text,
          timestamp: Date.now(),
        });

        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return () => clearTimeout(timeout);
  }, [addMessage, isMobile]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 30;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll on new messages (only if user is near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Hide ChatLog completely on mobile
  if (isMobile) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 126,
        left: 16,
        width: 340,
        height: isCollapsed ? 'auto' : 220,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        pointerEvents: 'auto',
      }}
    >
      {/* Pinned status bar — HUD frame style */}
      <div style={{
        position: 'relative',
        boxSizing: 'border-box',
        padding: '5px 40px 5px 10px',
        fontSize: 13,
        lineHeight: '1.4',
        color: '#8a8980',
        background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
        border: '1px solid #3a3530',
        borderRadius: isCollapsed ? '2px' : '2px 2px 0 0',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexWrap: 'nowrap',
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>{CHAT_STATUS_ITEMS[0].label}: {statusCounts.total} {CHAT_STATUS_ITEMS[0].emoji}</span>
        <span style={{ whiteSpace: 'nowrap' }}>{CHAT_STATUS_ITEMS[1].label}: {statusCounts.buried} {CHAT_STATUS_ITEMS[1].emoji}</span>
        <span style={{ whiteSpace: 'nowrap' }}>{CHAT_STATUS_ITEMS[2].label}: {statusCounts.cremated} {CHAT_STATUS_ITEMS[2].emoji}</span>
        <button
          type="button"
          data-testid="chat-collapse-toggle"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Развернуть чат' : 'Свернуть чат'}
          title={isCollapsed ? 'Развернуть чат' : 'Свернуть чат'}
          style={{
            position: 'absolute',
            top: '50%',
            right: 6,
            transform: 'translateY(-50%)',
            flexShrink: 0,
            width: 26,
            height: 24,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #5b5144',
            borderRadius: 2,
            color: '#e8d5a3',
            background: 'linear-gradient(180deg, #39342d 0%, #26221e 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            cursor: 'pointer',
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          <span aria-hidden="true">{isCollapsed ? '⌃' : '⌄'}</span>
        </button>
      </div>

      {/* Chat messages — transparent body with frame border */}
      {!isCollapsed && <div
        id="cemetery-chat-messages"
        style={{
          flex: 1,
          background: 'rgba(20, 18, 16, 0.60)',
          border: '1px solid #3a3530',
          borderTop: 'none',
          borderRadius: '0 0 2px 2px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 8px',
            fontSize: 14,
            lineHeight: '1.4',
            color: '#8a8980',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(100, 90, 60, 0.5) transparent',
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                color: MESSAGE_COLORS[msg.type],
                marginBottom: 2,
                wordBreak: 'break-word',
                animation: 'chatSlideIn 200ms ease-out both',
              }}
            >
              {MESSAGE_PREFIXES[msg.type]}{msg.text}
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
