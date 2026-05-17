import { createAgentAshReadHandlers, createSupabaseAgentAshReadStore } from '@/lib/agent-ashes-read'

export async function GET() {
  try {
    return await createAgentAshReadHandlers(createSupabaseAgentAshReadStore()).summary()
  } catch (error) {
    console.error('Failed to load Agent Ash summary:', error)
    return Response.json({ error: 'Failed to load Agent Ash summary' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
