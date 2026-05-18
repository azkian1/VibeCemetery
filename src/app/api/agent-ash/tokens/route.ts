import { NextResponse } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshTokensList } from '@/lib/agent-ash-auth'
import { requireSessionUsername } from '@/lib/cli-auth'

export async function GET() {
  try {
    return await handleAgentAshTokensList({
      store: createSupabaseAgentAshAuthStore(),
      username: await requireSessionUsername(),
    })
  } catch (error) {
    console.error('Agent Ash tokens list failed:', error)
    return NextResponse.json({ error: 'Failed to list Agent Ash tokens' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
