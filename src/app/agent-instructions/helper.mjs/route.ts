import { readAgentHelper } from '@/lib/agent-helper-source'

export async function GET() {
  const { source } = await readAgentHelper()
  return new Response(source, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })
}
