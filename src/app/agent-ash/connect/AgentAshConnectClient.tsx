'use client'

import { useEffect, useMemo, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import StoneFrame from '@/components/ui/StoneFrame'
import StoneButton from '@/components/ui/StoneButton'
import InsetBlock from '@/components/ui/InsetBlock'
import OrnamentDivider from '@/components/ui/OrnamentDivider'

type LinkSession = {
  status: 'pending' | 'approved' | 'denied' | 'claimed' | 'expired'
  agent_name: string
  agent_did: string | null
  gitlawb_node_url: string
  scopes: string[]
  expires_at: string
}

const AGENT_ASH_CONNECT_PAUSED = true

export default function AgentAshConnectClient({ linkId }: { linkId: string }) {
  const { data: session, status } = useSession()
  const [submitting, setSubmitting] = useState(false)
  const [decision, setDecision] = useState<'idle' | 'approved' | 'denied'>('idle')
  const [linkSession, setLinkSession] = useState<LinkSession | null>(null)
  const [loadingLink, setLoadingLink] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasLinkRequest = useMemo(
    () => /^ashlink_[A-Za-z0-9_-]{12,}$/.test(linkId),
    [linkId],
  )

  useEffect(() => {
    if (!hasLinkRequest) return

    let cancelled = false
    setLoadingLink(true)
    setLinkSession(null)
    setError(null)

    fetch(`/api/agent-ash/link/session?link_id=${encodeURIComponent(linkId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? 'Failed to load Agent Ash request')
        if (!cancelled) setLinkSession(body)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Agent Ash request')
      })
      .finally(() => {
        if (!cancelled) setLoadingLink(false)
      })

    return () => {
      cancelled = true
    }
  }, [hasLinkRequest, linkId])

  async function submitDecision(nextDecision: 'approve' | 'deny') {
    if (!hasLinkRequest || submitting || !linkSession || linkSession.status !== 'pending') return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/agent-ash/link/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: linkId, decision: nextDecision }),
      })

      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Failed to update Agent Ash access')
        return
      }

      setDecision(nextDecision === 'approve' ? 'approved' : 'denied')
    } catch {
      setError('Failed to update Agent Ash access')
    } finally {
      setSubmitting(false)
    }
  }

  const authCallbackUrl = typeof window === 'undefined'
    ? '/agent-ash/connect'
    : `${window.location.origin}${window.location.pathname}${window.location.search}`

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: 'radial-gradient(circle at top, #221f1a 0%, #121110 55%, #0c0b0a 100%)',
    }}>
      <StoneFrame isMobile={false} maxWidth={560}>
        <div style={{ padding: '24px 28px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, color: '#e8d5a3', textAlign: 'center' }}>
            Agent Ash Is Paused
          </h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#aaa9a0', textAlign: 'center', lineHeight: 1.6 }}>
            GitLawb / Agent Ash linking is archived until the cemetery is more populated. The raw ash token is never shown in the browser.
          </p>

          <InsetBlock>
            {!hasLinkRequest ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                Start Agent Ash setup first. The agent will open this page with a live link request.
              </div>
            ) : loadingLink ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13 }}>
                Reading the ash tablet...
              </div>
            ) : !linkSession ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                This Agent Ash link request could not be loaded.
              </div>
            ) : linkSession.status !== 'pending' ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                Agent Ash request is {linkSession.status}. Start a new setup if your agent still needs access.
              </div>
            ) : AGENT_ASH_CONNECT_PAUSED ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ color: '#e8d5a3', fontSize: 14, marginBottom: 8 }}>
                  Agent Ash approvals are paused.
                </div>
                <div>
                  No new Agent Ash token will be issued from this page. Use the human cemetery, GitHub scan, local project cremations instead.
                </div>
              </div>
            ) : status === 'loading' ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13 }}>
                Checking your session...
              </div>
            ) : !session?.user?.github_username ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 12px', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                  Sign in with GitHub first, then approve this Agent Ash request.
                </p>
                <StoneButton onClick={() => signIn('github', { callbackUrl: authCallbackUrl })}>
                  Sign In With GitHub
                </StoneButton>
              </div>
            ) : decision !== 'idle' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: decision === 'approved' ? '#68a060' : '#c87868', fontSize: 14, marginBottom: 8 }}>
                  Agent Ash request {decision}.
                </div>
                <div style={{ color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                  Return to your agent. Approved tokens can be claimed exactly once through polling.
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#8a8980', fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
                  Signed in as <span style={{ color: '#e8d5a3' }}>{session.user.github_username}</span>
                </div>
                <div style={{ textAlign: 'left', color: '#aaa9a0', fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
                  <div>Agent: <span style={{ color: '#e8d5a3' }}>{linkSession.agent_name}</span></div>
                  {linkSession.agent_did && <div>Agent DID: <span style={{ color: '#e8d5a3' }}>{linkSession.agent_did}</span></div>}
                  <div>GitLawb node: <span style={{ color: '#e8d5a3' }}>{linkSession.gitlawb_node_url}</span></div>
                  <div>Requested permission: <span style={{ color: '#e8d5a3' }}>{linkSession.scopes.join(', ')}</span></div>
                  <div>Expires: <span style={{ color: '#e8d5a3' }}>{new Date(linkSession.expires_at).toLocaleString()}</span></div>
                </div>
                <div style={{ textAlign: 'left', color: '#aaa9a0', fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
                  <div style={{ color: '#d7c78f' }}>If revived, this agent could submit verified Agent Ash records.</div>
                  <div style={{ color: '#c87868' }}>
                    This agent cannot create graves, call /api/cremated, use vc_cli tokens, or consume map slots.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <StoneButton onClick={() => submitDecision('approve')} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Approve If Revived'}
                  </StoneButton>
                  <StoneButton onClick={() => submitDecision('deny')} disabled={submitting}>
                    Deny
                  </StoneButton>
                </div>
              </div>
            )}
          </InsetBlock>

          <OrnamentDivider />

          {error && (
            <div style={{ textAlign: 'center', color: '#c87868', fontSize: 12, marginBottom: 10 }}>
              {error}
            </div>
          )}

          <div style={{ textAlign: 'center', color: '#6a6960', fontSize: 12, lineHeight: 1.6 }}>
            Tokens are stored hashed on the server and delivered once to the polling agent.
          </div>
        </div>
      </StoneFrame>
    </main>
  )
}
