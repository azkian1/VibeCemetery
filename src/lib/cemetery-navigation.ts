export const CEMETERY_PATH = '/cemetery'

export function cemeteryGravePath(graveId: string): string {
  return `${CEMETERY_PATH}?${new URLSearchParams({ grave: graveId })}`
}

/** Preserve repeated and future navigation parameters without accepting a redirect target. */
export function canonicalCemeteryPath(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item)
    }
  }
  const search = query.toString()
  return search ? `${CEMETERY_PATH}?${search}` : CEMETERY_PATH
}
