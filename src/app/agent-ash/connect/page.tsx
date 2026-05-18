import AgentAshConnectClient from './AgentAshConnectClient'

export default async function AgentAshConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string }>
}) {
  const params = await searchParams

  return <AgentAshConnectClient linkId={params.link_id?.trim() ?? ''} />
}
