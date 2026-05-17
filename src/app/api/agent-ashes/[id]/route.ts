import { createAgentAshReadHandlers, createSupabaseAgentAshReadStore } from '@/lib/agent-ashes-read'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return await createAgentAshReadHandlers(createSupabaseAgentAshReadStore()).detail(id)
  } catch (error) {
    console.error('Failed to load Agent Ash record:', error)
    return Response.json({ error: 'Failed to load Agent Ash record' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
