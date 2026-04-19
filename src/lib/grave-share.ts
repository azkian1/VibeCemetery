import { epitaphFallback } from '@/gravedigger/epitaphs'
import type { Metadata } from 'next'

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

  return {
    title: `${collapseWhitespace(opts.grave.name)} · VibeCemetery`,
    description: getShareDescription(opts.grave),
    url: graveUrl,
    imageUrl: `${graveUrl}/opengraph-image`,
    cause: collapseWhitespace(opts.grave.cause) || null,
    authorGithub: collapseWhitespace(opts.grave.author_github) || null,
  }
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
