import { AGENT_INSTRUCTION_SECTIONS, AGENT_INSTRUCTIONS_TITLE, AGENT_INSTRUCTIONS_SUBTITLE } from '@/lib/agent-instructions'
import { readAgentHelper } from '@/lib/agent-helper-source'
import Link from 'next/link'

export const metadata = {
  title: 'Instructions for AI agents — VibeCemetery',
  description: 'Help a human cremate a local AI-built project. Read the workflow, browser approval steps and API contract.',
  alternates: { canonical: 'https://vibecemetery.app/agent-instructions' },
}

export default async function AgentInstructionsPage() {
  const { sha256 } = await readAgentHelper()
  return (
    <main style={{ minHeight: '100vh', background: '#10100f', color: '#bbb4a6', padding: 'clamp(24px, 6vw, 64px) 20px', lineHeight: 1.75, fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Link href="/" style={{ color: '#bba477', fontSize: 14 }}>← VibeCemetery</Link>
        <header style={{ padding: '36px 0 28px', borderBottom: '1px solid #373027' }}>
          <p style={{ color: '#9b8268', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>{AGENT_INSTRUCTIONS_SUBTITLE}</p>
          <h1 style={{ color: '#e8d5a3', fontFamily: 'var(--font-cinzel), Georgia, serif', fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.2, margin: '12px 0 20px' }}>{AGENT_INSTRUCTIONS_TITLE}</h1>
          <p>Give your coding agent <a href="https://vibecemetery.app" style={{ color: '#e8d5a3' }}>vibecemetery.app</a> and tell it which project you want to cremate. Your agent will inspect the project and ask for your confirmation before publishing.</p>
          <p style={{ color: '#938c7e' }}>Your project can stay on your computer or VPS.</p>
          <a href="/agent-instructions.md" type="text/markdown" style={{ color: '#9fb6c9' }}>Read as Markdown ↗</a>
        </header>
        <article>
          {AGENT_INSTRUCTION_SECTIONS.map(({ title, text }) => (
            <section key={title} style={{ padding: '24px 0', borderBottom: '1px solid #29251e' }}>
              <h2 style={{ color: '#d9c79e', fontSize: 20, margin: '0 0 14px' }}>{title}</h2>
              {text.split('\n\n').map((paragraph) => <p key={paragraph.slice(0, 70)} style={{ margin: '12px 0', overflowWrap: 'anywhere' }}>{paragraph}</p>)}
            </section>
          ))}
          <section style={{ paddingTop: 24 }}>
            <h2 style={{ color: '#d9c79e', fontSize: 20 }}>Helper integrity</h2>
            <a href="/agent-instructions/helper.mjs" style={{ color: '#9fb6c9' }}>Read the temporary helper source</a>
            <p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>SHA-256: <code>{sha256}</code></p>
          </section>
        </article>
      </div>
    </main>
  )
}
