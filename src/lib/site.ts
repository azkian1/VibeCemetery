const PROD_FALLBACK_SITE_URL = 'https://vibecemetery.com'
const DEV_FALLBACK_SITE_URL = 'http://localhost:3000'

export function getSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  const fallbackUrl = process.env.NODE_ENV === 'production'
    ? PROD_FALLBACK_SITE_URL
    : DEV_FALLBACK_SITE_URL
  const rawUrl = (configuredUrl || fallbackUrl).replace(/\/+$/, '')

  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_SITE_URL must use http or https')
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SITE_URL: ${rawUrl}`)
  }
}

export function getCliApprovalSiteUrl(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required in production for CLI approval links')
  }

  return getSiteUrl()
}
