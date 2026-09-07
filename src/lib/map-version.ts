export const SUPPORTED_MAP_VERSIONS = ['v1', 'v2'] as const
export const DEFAULT_MAP_VERSION = 'v2' as const
export const CEMETERY_VERSION_RETIRED = {
  code: 'CEMETERY_VERSION_RETIRED',
  error: 'Cemetery v1 has retired. Update your client and use map_version v2.',
} as const
export const CEMETERY_BURIALS_PAUSED = {
  code: 'CEMETERY_BURIALS_PAUSED',
  error: 'New burials are temporarily paused for cemetery maintenance. Please try again later.',
} as const

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
  if (value === undefined) return DEFAULT_MAP_VERSION
  return isSupportedMapVersion(value) ? value : null
}
