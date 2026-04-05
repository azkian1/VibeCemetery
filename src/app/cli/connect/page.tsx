import CliConnectClient from './CliConnectClient'

export default async function CliConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string }>
}) {
  const params = await searchParams

  return <CliConnectClient linkId={params.link_id?.trim() ?? ''} />
}
