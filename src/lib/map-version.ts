export const SUPPORTED_MAP_VERSIONS = ['v1', 'v2'] as const

export type SupportedMapVersion = (typeof SUPPORTED_MAP_VERSIONS)[number]

export function isSupportedMapVersion(value: unknown): value is SupportedMapVersion {
  return typeof value === 'string' && SUPPORTED_MAP_VERSIONS.includes(value as SupportedMapVersion)
}

/**
 * Resolve an omitted map version to the default, but reject every explicitly
 * supplied value outside the supported namespace. Map version scopes slot,
 * quota, and locking state, so it must not create arbitrary namespaces.
 */
export function parseMapVersion(value: unknown): SupportedMapVersion | null {
  if (value === undefined) return 'v1'
  return isSupportedMapVersion(value) ? value : null
}
