'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { getDemoSession } from '@/demo/mode'

export default function AppProviders({ children }: { children: ReactNode }) {
  const demoSession = getDemoSession()

  if (demoSession) {
    return <SessionProvider session={demoSession}>{children}</SessionProvider>
  }

  return <SessionProvider>{children}</SessionProvider>
}
