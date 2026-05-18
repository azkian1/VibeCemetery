import { NextResponse } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshLinkSession } from '@/lib/agent-ash-auth'

export async function GET(request: Request) {
  try {
    return await handleAgentAshLinkSession(request, {
      store: createSupabaseAgentAshAuthStore(),
    })
  } catch (error) {
    console.error('Agent Ash link session failed:', error)
    return NextResponse.json({ error: 'Failed to load Agent Ash link session' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
