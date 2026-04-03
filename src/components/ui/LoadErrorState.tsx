'use client';

import StoneButton from './StoneButton'

interface LoadErrorStateProps {
  message: string
  onRetry: () => void
  retryLabel?: string
  compact?: boolean
}

export default function LoadErrorState({
  message,
  onRetry,
  retryLabel = 'Try Again',
  compact = false,
}: LoadErrorStateProps) {
  return (
    <div
      style={{
        padding: compact ? '20px 16px' : '40px 20px',
        textAlign: 'center',
        color: '#a09888',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: compact ? undefined : 220,
      }}
    >
      <p style={{ margin: 0, fontSize: compact ? 13 : 14, fontStyle: 'italic', lineHeight: 1.6 }}>
        {message}
      </p>
      <StoneButton onClick={onRetry}>{retryLabel}</StoneButton>
    </div>
  )
}
