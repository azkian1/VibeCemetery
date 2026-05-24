import { epitaphFallback } from '@/gravedigger/epitaphs'
import type { Metadata } from 'next'

const GRAVE_OG_IMAGE_VERSION = 'social-v3'

export interface GraveShareData {
  id: string
  name: string
  cause: string | null
  epitaph: string | null
  born_at: string | null
  died_at: string | null
  stack: string | null
  author_github?: string | null
}

export interface GraveShareCard {
  title: string
  description: string
  url: string
  imageUrl: string
  cause: string | null
  authorGithub: string | null
}

export interface GraveShareMetadataOptions {
  siteUrl: string
  grave: GraveShareData
}

export interface GraveTweetIntentOptions {
  graveUrl: string
  name: string
  cause: string | null
  perspective?: 'owner' | 'visitor'
}

function collapseWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}...` : value
}

function getShareDescription(grave: GraveShareData): string {
  const storedEpitaph = collapseWhitespace(grave.epitaph)
  if (storedEpitaph) return truncate(storedEpitaph, 160)

  const fallback = collapseWhitespace(epitaphFallback(grave))
  return truncate(`${grave.name}. ${fallback}`, 160)
}

export function buildGraveShareCard(opts: {
  siteUrl: string
  grave: GraveShareData
}): GraveShareCard {
  const graveUrl = `${opts.siteUrl}/grave/${opts.grave.id}`
  const imageUrl = `${graveUrl}/opengraph-image?v=${GRAVE_OG_IMAGE_VERSION}`

  return {
    title: `${collapseWhitespace(opts.grave.name)} · VibeCemetery`,
    description: getShareDescription(opts.grave),
    url: graveUrl,
    imageUrl,
    cause: collapseWhitespace(opts.grave.cause) || null,
    authorGithub: collapseWhitespace(opts.grave.author_github) || null,
  }
}

export function buildGraveTweetIntentUrl({ graveUrl, name, cause, perspective = 'owner' }: GraveTweetIntentOptions): string {
  const safeName = truncate(collapseWhitespace(name) || 'a project', 60)
  const safeCause = truncate(collapseWhitespace(cause) || 'Unknown', 90)
  const openingLine = perspective === 'visitor'
    ? `I paid respects to ${safeName} in @vibecmtry.`
    : `I buried ${safeName} in @vibecmtry.`
  const tweetText = [
    openingLine,
    '',
    `Cause of death: ${safeCause}.`,
    '',
    'Pay respects:',
  ].join('\n')

  const params = new URLSearchParams({
    text: tweetText,
    url: graveUrl,
  })

  return `https://twitter.com/intent/tweet?${params.toString()}`
}

export function buildGraveShareMetadata(opts: GraveShareMetadataOptions): Metadata {
  const card = buildGraveShareCard(opts)

  return {
    title: card.title,
    description: card.description,
    alternates: {
      canonical: card.url,
    },
    openGraph: {
      title: card.title,
      description: card.description,
      url: card.url,
      images: [{ url: card.imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: card.title,
      description: card.description,
      images: [card.imageUrl],
    },
  }
}

export function buildNoIndexMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: false,
    },
  }
}
