'use client'

import { useEffect, useMemo, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import StoneFrame from '@/components/ui/StoneFrame'
import StoneButton from '@/components/ui/StoneButton'
import InsetBlock from '@/components/ui/InsetBlock'
import OrnamentDivider from '@/components/ui/OrnamentDivider'

function getClaimTokenStorageKey(linkId: string) {
  return `vc-cli-claim-token:${linkId}`
}

export default function CliConnectClient({ linkId }: { linkId: string }) {
  const { data: session, status } = useSession()
  const [submitting, setSubmitting] = useState(false)
  const [approveState, setApproveState] = useState<'idle' | 'approved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [claimToken, setClaimToken] = useState('')

  const hasLinkRequest = useMemo(
    () => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(linkId),
    [linkId],
  )

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hashClaimToken = hashParams.get('claim_token')?.trim() ?? ''
    const storageKey = getClaimTokenStorageKey(linkId)
    const storedClaimToken = hashClaimToken ? '' : window.sessionStorage.getItem(storageKey)?.trim() ?? ''
    const nextClaimToken = hashClaimToken || storedClaimToken

    if (hashClaimToken) {
      window.sessionStorage.setItem(storageKey, hashClaimToken)
    }

    setClaimToken(nextClaimToken)

    if (window.location.hash) {
      const cleanUrl = `${window.location.pathname}${window.location.search}`
      window.history.replaceState(window.history.state, '', cleanUrl)
    }
  }, [linkId])

  async function handleApprove() {
    if (!hasLinkRequest || !claimToken || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/cli/link/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: linkId, claim_token: claimToken }),
      })

      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Failed to approve CLI access')
        return
      }

      setApproveState('approved')
      window.sessionStorage.removeItem(getClaimTokenStorageKey(linkId))
    } catch {
      setError('Failed to approve CLI access')
    } finally {
      setSubmitting(false)
    }
  }

  const authCallbackUrl = typeof window === 'undefined'
    ? '/cli/connect'
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
      <StoneFrame isMobile={false} maxWidth={520}>
        <div style={{ padding: '24px 28px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, color: '#e8d5a3', textAlign: 'center' }}>
            Connect your coding agent
          </h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#aaa9a0', textAlign: 'center', lineHeight: 1.6 }}>
            Approve your coding agent’s request to create burial records under your GitHub account. Your agent will continue after you approve.
          </p>

          <InsetBlock>
            {!hasLinkRequest ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                Ask your coding agent to follow the instructions at vibecemetery.app. It will give you a fresh approval link.
              </div>
            ) : !claimToken ? (
              <div style={{ textAlign: 'center', color: '#c87868', fontSize: 13, lineHeight: 1.6 }}>
                This link request is missing approval proof. Ask your coding agent for a fresh approval link.
              </div>
            ) : status === 'loading' ? (
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13 }}>
                Checking your session...
              </div>
            ) : !session?.user?.github_username ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 12px', color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                  Sign in with GitHub first, then approve this link request.
                </p>
                <StoneButton
                  onClick={() => signIn('github', { callbackUrl: authCallbackUrl })}
                >
                  Sign In With GitHub
                </StoneButton>
              </div>
            ) : approveState === 'approved' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#68a060', fontSize: 14, marginBottom: 8 }}>
                  Link request approved.
                </div>
                <div style={{ color: '#8a8980', fontSize: 13, lineHeight: 1.6 }}>
                  Return to your coding agent to continue the burial.
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#8a8980', fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
                  Signed in as <span style={{ color: '#e8d5a3' }}>{session.user.github_username}</span>
                </div>
                <StoneButton onClick={handleApprove} disabled={submitting}>
                  {submitting ? 'Approving...' : 'Approve Agent Access'}
                </StoneButton>
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
            Tokens are stored hashed on the server. This page only approves the request.
          </div>
        </div>
      </StoneFrame>
    </main>
  )
}
