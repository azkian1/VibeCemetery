import { NextResponse } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshLinkStatus } from '@/lib/agent-ash-auth'
import { getSiteUrl } from '@/lib/site'

export async function GET(request: Request) {
  try {
    return await handleAgentAshLinkStatus(request, {
      store: createSupabaseAgentAshAuthStore(),
      siteUrl: getSiteUrl(),
    })
  } catch (error) {
    console.error('Agent Ash link status failed:', error)
    return NextResponse.json({ error: 'Failed to load Agent Ash link status' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
