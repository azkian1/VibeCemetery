import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import GraveRedirectClient from './GraveRedirectClient'
import { buildGraveShareMetadata, buildNoIndexMetadata } from '@/lib/grave-share'
import { getGraveShareData } from '@/lib/grave-share-server'
import { getSiteUrl } from '@/lib/site'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const siteUrl = getSiteUrl()

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return buildNoIndexMetadata()

  const result = await getGraveShareData(id)
  if (result.kind !== 'ok') return buildNoIndexMetadata()

  return buildGraveShareMetadata({ siteUrl, grave: result.grave })
}

// /grave/[id] → redirect to cemetery with ?grave=id to navigate camera to the grave
export default async function GravePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    redirect('/')
  }

  const result = await getGraveShareData(id)
  if (result.kind === 'not_found') notFound()
  if (result.kind === 'error') {
    throw new Error(`Failed to load grave share data: ${result.message}`)
  }

  return <GraveRedirectClient graveId={id} />
}
