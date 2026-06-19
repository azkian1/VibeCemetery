import { NextResponse } from 'next/server'

export const AGENT_LAYER_PAUSED = true

export function agentLayerPausedResponse() {
  return NextResponse.json({ error: 'Agent Layer is paused' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
