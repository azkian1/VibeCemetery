import { NextResponse } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshTokenRevoke } from '@/lib/agent-ash-auth'
import { requireSessionUsername } from '@/lib/cli-auth'

export async function POST(request: Request) {
  try {
    return await handleAgentAshTokenRevoke(request, {
      store: createSupabaseAgentAshAuthStore(),
      username: await requireSessionUsername(),
    })
  } catch (error) {
    console.error('Agent Ash token revoke failed:', error)
    return NextResponse.json({ error: 'Failed to revoke Agent Ash token' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
