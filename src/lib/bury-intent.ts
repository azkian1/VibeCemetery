const BURY_MODAL_QUERY = 'modal'
const BURY_MODAL_VALUE = 'bury'

export function getBuryLoginCallbackUrl(): string {
  const mapPath = '/cemetery'
  return `${mapPath}?${BURY_MODAL_QUERY}=${BURY_MODAL_VALUE}`
}

export function shouldOpenBuryModalFromSearchParams(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get(BURY_MODAL_QUERY) === BURY_MODAL_VALUE
}

export function removeBuryModalIntentFromUrl(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(BURY_MODAL_QUERY)
  return `${url.pathname}${url.search}${url.hash}`
}
