import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { buildGraveShareCard } from '@/lib/grave-share'
import { getGraveShareData } from '@/lib/grave-share-server'
import { getSiteUrl } from '@/lib/site'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const siteUrl = getSiteUrl()

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getGraveShareData(id)

  if (result.kind !== 'ok') notFound()

  const card = buildGraveShareCard({ siteUrl, grave: result.grave })

  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: 'linear-gradient(180deg, #11110f 0%, #171613 40%, #0b0b0a 100%)',
        color: '#f0e2b0',
        padding: '44px',
        fontFamily: 'Georgia, serif',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          border: '2px solid #3c372f',
          background: 'linear-gradient(180deg, rgba(33,30,26,0.95) 0%, rgba(16,15,13,0.98) 100%)',
          padding: '42px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9e9786', fontSize: 26 }}>
            <span>VibeCemetery</span>
            <span>R.I.P.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
            <div style={{ fontSize: 68, lineHeight: 1.05, color: '#f4ead1' }}>{result.grave.name}</div>
            <div style={{ marginTop: 24, fontSize: 34, lineHeight: 1.35, color: '#d8c9a0' }}>
              {card.description}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 26, color: '#b4ab97' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span>Cause of death</span>
              <span style={{ color: '#f0d089', fontSize: 30 }}>{card.cause ?? 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right', maxWidth: 520 }}>
              <span>Last commit</span>
              <span style={{ color: '#d8d1c1', fontSize: 28 }}>
                {card.lastCommitMessage ?? 'No last words recorded'}
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
