'use client';

import { useEffect, useRef, useCallback } from 'react';
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function ChatLog() {
  const isMobile = useIsMobile();
  const { messages, addMessage } = useChat();
  const { state } = useGame();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const lastIdleIndexRef = useRef(-1);
  const lastGravediggerTimeRef = useRef(0);
  const messagesRef = useRef(messages);
  const stateRef = useRef(state);
  const mountedRef = useRef(false);

  // Keep refs in sync without resetting idle timer
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // On mount: system greeting + gravedigger greeting (skip on mobile)
  useEffect(() => {
    if (isMobile) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    addMessage({
      id: crypto.randomUUID(),
      type: 'system',
      text: 'Connecting to the cemetery...',
      timestamp: Date.now(),
    });

    setTimeout(() => {
      addMessage({
        id: crypto.randomUUID(),
        type: 'gravedigger',
        text: pickRandom(GRAVEDIGGER_GREETING),
        timestamp: Date.now(),
      });
    }, 1200);
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
        if (!text) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        bottom: 16,
        left: 16,
        width: 340,
        height: 220,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        pointerEvents: 'auto',
      }}
    >
      {/* Pinned status bar — HUD frame style */}
      <div style={{
        padding: '5px 10px',
        fontSize: 14,
        lineHeight: '1.4',
        color: '#8a8980',
        background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
        border: '1px solid #3a3530',
        borderRadius: '2px 2px 0 0',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
        flexShrink: 0,
        display: 'flex',
        gap: 14,
      }}>
        <span>Souls: {state.graves.size} 💀</span>
        <span>Cremated: {state.cremated.length} 🔥</span>
      </div>

      {/* Chat messages — transparent body with frame border */}
      <div
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
      </div>
    </div>
  );
}
