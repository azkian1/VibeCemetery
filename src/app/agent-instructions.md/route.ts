import { readAgentHelper } from '@/lib/agent-helper-source'
import { agentInstructionsMarkdown } from '@/lib/agent-instructions'

export async function GET() {
  const { sha256 } = await readAgentHelper()
  return new Response(agentInstructionsMarkdown(sha256), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' } })
}
