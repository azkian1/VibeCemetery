export const SUPPORTED_MAP_VERSIONS = ['v1', 'v2'] as const

/** Canonical public asset for the Cemetery Map 2.0 runtime. */
export const CEMETERY_MAP_V2_FILE = 'cemetery-v2.tmj'
export const CEMETERY_MAP_V2_URL = `/map/${CEMETERY_MAP_V2_FILE}`

export type SupportedMapVersion = (typeof SUPPORTED_MAP_VERSIONS)[number]

export function isSupportedMapVersion(value: unknown): value is SupportedMapVersion {
  return typeof value === 'string' && SUPPORTED_MAP_VERSIONS.includes(value as SupportedMapVersion)
}

/**
 * Resolve an omitted map version to the default, but reject every explicitly
 * supplied value outside the supported namespace. Map version scopes placement slots,
 * while account quotas span all supported maps.
 */
export function parseMapVersion(value: unknown): SupportedMapVersion | null {
  if (value === undefined) return 'v1'
  return isSupportedMapVersion(value) ? value : null
}
