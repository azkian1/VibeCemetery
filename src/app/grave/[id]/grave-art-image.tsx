type TextLayout = { lines: string[]; fontSize: number; lineHeight: number }

export interface GraveArtCardProps {
  name: string
  cause: string
  author: string
  lifeDates: string | null
  artSrc: string
}

function splitAtWord(text: string, maxLineLength: number): string[] {
  const words = text.split(' ')
  if (words.length === 1) {
    const midpoint = Math.ceil(text.length / 2)
    return [text.slice(0, midpoint), text.slice(midpoint)]
  }

  let best = 1
  let bestDifference = Infinity
  for (let index = 1; index < words.length; index++) {
    const first = words.slice(0, index).join(' ')
    const second = words.slice(index).join(' ')
    const difference = Math.abs(first.length - second.length)
    if (first.length <= maxLineLength && second.length <= maxLineLength && difference < bestDifference) {
      best = index
      bestDifference = difference
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

function truncateLine(line: string, maxLength: number): string {
  return line.length > maxLength ? `${line.slice(0, maxLength - 3).trimEnd()}...` : line
}

function fitFontSize(lines: string[], maxFontSize: number): number {
  const widest = Math.max(...lines.map(line => [...line.toUpperCase()].reduce((width, letter) => {
    if (letter === ' ') return width + 0.35
    if ('MW'.includes(letter)) return width + 1
    if ('I1JL'.includes(letter)) return width + 0.45
    return width + 0.72
  }, 0)), 1)
  return Math.max(30, Math.min(maxFontSize, Math.floor(530 / widest)))
}

function wrapName(name: string): string[] {
  const words = name.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= 18) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word
    while (line.length > 18) {
      lines.push(line.slice(0, 18))
      line = line.slice(18)
    }
  }
  if (line) lines.push(line)
  if (lines.length > 3) return [...lines.slice(0, 2), truncateLine(`${lines[2]}...`, 18)]
  return lines
}

function textLayout(value: string, singleLineMax: number, maxLineLength: number, maxFontSize: number, minFontSize: number): TextLayout {
  const normalized = value.trim().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ') || 'Unknown'
  const lines = normalized.length <= singleLineMax ? [normalized] : splitAtWord(normalized, maxLineLength)
  const visibleLines = lines.filter(Boolean).slice(0, 2).map(line => truncateLine(line, maxLineLength))
  const fontSize = Math.max(minFontSize, fitFontSize(visibleLines, maxFontSize))
  return { lines: visibleLines, fontSize, lineHeight: 1.05 }
}

export function getGraveArtNameLayout(name: string): TextLayout {
  const normalized = name.trim().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ') || 'Unnamed project'
  const lines = normalized.length <= 12 ? [normalized] : wrapName(normalized)
  const fontSize = fitFontSize(lines, lines.length > 2 ? 50 : 82)
  return { lines, fontSize, lineHeight: 1.05 }
}

export function getGraveArtCauseLayout(cause: string): TextLayout {
  return textLayout(cause || 'Unknown', 17, 24, 56, 30)
}

export function renderGraveArtImage({ name, cause, author, lifeDates, artSrc }: GraveArtCardProps) {
  const nameLayout = getGraveArtNameLayout(name)
  const causeLayout = getGraveArtCauseLayout(cause)
  const safeAuthor = author.length > 26 ? `${author.slice(0, 23)}...` : author

  return <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', color: '#eee7d5', background: 'radial-gradient(ellipse at 27% 38%, #303727 0%, #1b211a 50%, #111611 85%)', fontFamily: 'Cinzel, serif' }}>
    <div style={{ position: 'absolute', left: 24, top: 24, width: 1152, height: 582, border: '2px solid #59684b', display: 'flex' }} />
    <div style={{ position: 'absolute', left: 34, right: 34, bottom: 34, height: 108, borderTop: '1px solid #34412d', background: 'linear-gradient(180deg, #1a2118 0%, #121811 100%)', display: 'flex' }} />
    <div style={{ position: 'absolute', left: 90, top: 62, width: 420, height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artSrc} alt="" width={420} height={430} style={{ width: 420, height: 430, objectFit: 'contain' }} />
    </div>
    <div style={{ position: 'absolute', right: 74, top: 56, transform: 'rotate(8deg)', border: '2px solid #80594d', color: '#b87a68', padding: '8px 13px', fontSize: 16, fontWeight: 700, letterSpacing: 2, display: 'flex' }}>DEAD PROJECT</div>
    <div style={{ position: 'absolute', left: 540, top: 102, width: 565, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', color: '#b9a979', fontSize: 18, letterSpacing: 5, fontWeight: 700 }}>HERE LIES</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, marginBottom: nameLayout.lines.length > 2 ? 12 : nameLayout.lines.length > 1 ? 20 : 32 }}>
        {nameLayout.lines.map((line, index) => <div key={`${line}-${index}`} style={{ display: 'flex', color: '#f4ead1', fontSize: nameLayout.fontSize, lineHeight: nameLayout.lineHeight, fontWeight: 700, whiteSpace: 'nowrap' }}>{line}</div>)}
      </div>
      <div style={{ display: 'flex', color: '#99a486', fontSize: 18, letterSpacing: 3, fontWeight: 700 }}>CAUSE OF DEATH</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, marginBottom: causeLayout.lines.length > 1 ? (nameLayout.lines.length > 2 ? 10 : 18) : 29 }}>
        {causeLayout.lines.map((line, index) => <div key={`${line}-${index}`} style={{ display: 'flex', color: '#e7ca8e', fontSize: causeLayout.fontSize, lineHeight: causeLayout.lineHeight, fontWeight: 700, whiteSpace: 'nowrap' }}>{line}</div>)}
      </div>
      <div style={{ display: 'flex', width: 420, height: 1, background: '#506146', marginBottom: 22 }} />
      <div style={{ display: 'flex', alignItems: 'center', color: '#d4d4bd', fontSize: 24 }}>
        <span>Buried by&nbsp;</span><span style={{ color: '#f5e9c7', fontWeight: 700 }}>{safeAuthor}</span>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 540, right: 86, bottom: 65, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 19, color: '#b5bd9e' }}>
      <span>{lifeDates?.toUpperCase() || 'IN MEMORIAM'}</span>
      <span style={{ fontSize: 23, color: '#dfc994', fontWeight: 700 }}>vibecemetery.app</span>
    </div>
  </div>
}
