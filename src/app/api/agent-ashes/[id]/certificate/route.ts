import { createAgentAshReadHandlers, createSupabaseAgentAshReadStore } from '@/lib/agent-ashes-read'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return await createAgentAshReadHandlers(createSupabaseAgentAshReadStore()).certificate(id)
  } catch (error) {
    console.error('Failed to load Agent Ash certificate:', error)
    return Response.json({ error: 'Failed to load Agent Ash certificate' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
