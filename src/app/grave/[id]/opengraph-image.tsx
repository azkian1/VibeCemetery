import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { buildGraveShareCard } from '@/lib/grave-share'
import { getGraveShareData } from '@/lib/grave-share-server'
import { getSiteUrl } from '@/lib/site'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const siteUrl = getSiteUrl()
const stoneNoise = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

function splitName(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [name]

  const midpoint = Math.ceil(words.length / 2)
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')]
}

function getNameLayout(name: string) {
  const compactName = name.trim()

  if (compactName.length <= 10) {
    return { lines: [compactName], fontSize: 62, lineHeight: 1 }
  }

  if (compactName.length <= 18) {
    return { lines: splitName(compactName), fontSize: 50, lineHeight: 1.02 }
  }

  if (compactName.length <= 28) {
    return { lines: splitName(compactName), fontSize: 40, lineHeight: 1.04 }
  }

  return {
    lines: splitName(compactName.length > 34 ? `${compactName.slice(0, 31).trimEnd()}...` : compactName),
    fontSize: 34,
    lineHeight: 1.06,
  }
}

function formatLifeDates(bornAt: string | null, diedAt: string | null): string | null {
  const format = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }

  const born = format(bornAt)
  const died = format(diedAt)

  if (born && died) return `${born} - ${died}`
  if (born) return `${born} - ?`
  if (died) return `? - ${died}`
  return null
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getGraveShareData(id)

  if (result.kind !== 'ok') notFound()

  const card = buildGraveShareCard({ siteUrl, grave: result.grave })
  const author = card.authorGithub ? `@${card.authorGithub}` : 'Unknown necromancer'
  const cause = card.cause ?? 'Terminal vibe collapse'
  const nameLayout = getNameLayout(result.grave.name)
  const lifeDates = formatLifeDates(result.grave.born_at, result.grave.died_at)

  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: 'radial-gradient(circle at 50% 12%, rgba(158, 137, 99, 0.12), transparent 28%), linear-gradient(180deg, #0b0a09 0%, #14110f 50%, #060606 100%)',
        color: '#f0e2b0',
        padding: '32px',
        fontFamily: 'Georgia, serif',
        alignItems: 'stretch',
      }}>
        <div style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          border: '1px solid #28231d',
          background: 'linear-gradient(180deg, rgba(19,17,15,0.9) 0%, rgba(10,9,8,0.97) 100%)',
          padding: '34px 36px',
          gap: '34px',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: '12px',
            border: '1px solid rgba(200,160,80,0.12)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: '18px',
            left: '18px',
            width: '54px',
            height: '54px',
            borderTop: '1px solid rgba(200,160,80,0.18)',
            borderLeft: '1px solid rgba(200,160,80,0.18)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            width: '54px',
            height: '54px',
            borderTop: '1px solid rgba(200,160,80,0.18)',
            borderRight: '1px solid rgba(200,160,80,0.18)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '18px',
            left: '18px',
            width: '54px',
            height: '54px',
            borderBottom: '1px solid rgba(200,160,80,0.18)',
            borderLeft: '1px solid rgba(200,160,80,0.18)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '18px',
            right: '18px',
            width: '54px',
            height: '54px',
            borderBottom: '1px solid rgba(200,160,80,0.18)',
            borderRight: '1px solid rgba(200,160,80,0.18)',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: '430px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: '370px',
              height: '520px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px 28px 28px',
              borderTopLeftRadius: '185px',
              borderTopRightRadius: '185px',
              borderBottomLeftRadius: '26px',
              borderBottomRightRadius: '26px',
              background: 'linear-gradient(180deg, #948a7d 0%, #7b7267 16%, #61584e 42%, #433c35 72%, #2b2622 100%)',
              border: '3px solid #a89d8b',
              boxShadow: 'inset 0 0 0 2px rgba(40,34,29,0.42), inset 0 -28px 46px rgba(0,0,0,0.24), 0 12px 28px rgba(0,0,0,0.18)',
              color: '#111111',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: stoneNoise,
                backgroundSize: '128px 128px',
                opacity: 0.028,
              }} />
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.06), transparent 28%), radial-gradient(circle at 72% 68%, rgba(0,0,0,0.06), transparent 30%)',
              }} />
              <div style={{
                position: 'absolute',
                inset: '14px',
                borderTopLeftRadius: '170px',
                borderTopRightRadius: '170px',
                borderBottomLeftRadius: '18px',
                borderBottomRightRadius: '18px',
                border: '1px solid rgba(248, 238, 220, 0.12)',
              }} />
              <div style={{
                fontSize: 24,
                letterSpacing: '12px',
                marginTop: '10px',
                color: '#111111',
              }}>
                R I P
              </div>
              <div style={{
                marginTop: '30px',
                width: '268px',
                height: '2px',
                background: 'rgba(34, 29, 25, 0.45)',
              }} />
              <div style={{
                marginTop: '30px',
                width: '292px',
                minHeight: '126px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontSize: `${nameLayout.fontSize}px`,
                lineHeight: nameLayout.lineHeight,
                textTransform: 'uppercase',
                color: '#111111',
              }}>
                {nameLayout.lines.map((line, index) => (
                  <span key={`${line}-${index}`}>{line}</span>
                ))}
              </div>
              <div style={{
                marginTop: '10px',
                width: '242px',
                height: '2px',
                background: 'rgba(34, 29, 25, 0.45)',
              }} />
              <div style={{
                marginTop: '28px',
                width: '272px',
                textAlign: 'center',
                fontSize: 20,
                lineHeight: 1.45,
                color: '#111111',
              }}>
                {card.description}
              </div>
              {lifeDates ? (
                <div style={{
                  marginTop: '22px',
                  fontSize: 17,
                  letterSpacing: '1px',
                  color: '#111111',
                  fontWeight: 600,
                }}>
                  {lifeDates}
                </div>
              ) : null}
              <div style={{
                marginTop: 'auto',
                fontSize: 17,
                letterSpacing: '1px',
                color: '#c9a86a',
                fontWeight: 600,
                opacity: 0.88,
              }}>
                VibeCemetery.app
              </div>
            </div>
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'center',
            paddingRight: '10px',
          }}>
            <div style={{
              marginTop: '26px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '262px',
              padding: '26px 28px',
              border: '1px solid #302720',
              background: 'linear-gradient(180deg, rgba(12,11,10,0.64) 0%, rgba(7,7,6,0.74) 100%)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: '-26px',
                right: '20px',
                border: '1px solid #5a4136',
                color: '#d97764',
                padding: '10px 22px',
                fontSize: 22,
                letterSpacing: '1px',
                transform: 'rotate(-9deg)',
                background: 'rgba(14, 12, 11, 0.92)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}>
                DEAD PROJECT
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: 17, color: '#887c6d', letterSpacing: '3px' }}>CAUSE OF DEATH</div>
                <div style={{
                  fontSize: 64,
                  lineHeight: 0.96,
                  color: '#f0ce8a',
                  maxWidth: '520px',
                }}>
                  {cause}
                </div>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(200,160,80,0.1)',
              }}>
                <span style={{ fontSize: 17, color: '#817665', letterSpacing: '2px' }}>GITHUB REAPER</span>
                <span style={{ fontSize: 32, color: '#e7dfcd' }}>{author}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
