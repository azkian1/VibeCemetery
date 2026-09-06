'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GraveRedirectClient({ graveId, mapVersion }: { graveId: string; mapVersion?: 'v1' | 'v2' }) {
  const router = useRouter()
  const target = `${mapVersion === 'v2' ? '/cemetery/v2' : '/cemetery'}?grave=${graveId}`

  useEffect(() => {
    router.replace(target)
  }, [router, target])

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#0a0a09',
      color: '#d4d0c4',
      textAlign: 'center',
      fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
    }}>
      <div>
        <noscript>
          <meta httpEquiv="refresh" content={`0;url=${target}`} />
        </noscript>
        <p style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Opening grave link...</p>
        <Link href={target} style={{ color: '#e8d5a3' }}>
          Continue to the cemetery
        </Link>
      </div>
    </main>
  )
}
