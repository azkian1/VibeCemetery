import { NextResponse } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshLinkApprove } from '@/lib/agent-ash-auth'
import { AGENT_LAYER_PAUSED, agentLayerPausedResponse } from '@/lib/agent-layer-pause'
import { requireSessionUsername } from '@/lib/cli-auth'

export async function POST(request: Request) {
  if (AGENT_LAYER_PAUSED) return agentLayerPausedResponse()

  try {
    return await handleAgentAshLinkApprove(request, {
      store: createSupabaseAgentAshAuthStore(),
      username: await requireSessionUsername(),
    })
  } catch (error) {
    console.error('Agent Ash link approve failed:', error)
    return NextResponse.json({ error: 'Failed to approve Agent Ash link' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
