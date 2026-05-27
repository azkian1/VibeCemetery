export const DEMO_ENV_FLAG = 'NEXT_PUBLIC_VIBECEMETERY_DEMO'
export const DEMO_USERNAME = 'demo-gravedigger'
export const DEMO_GRAVE_BONUS_SLOTS = 0

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO !== '1') return false
  return process.env.NODE_ENV !== 'production'
}

export function getDemoSession() {
  if (!isDemoMode()) return null

  return {
    user: {
      name: 'Demo Gravedigger',
      email: null,
      image: '',
      github_username: DEMO_USERNAME,
      x_first_grave_shared_at: new Date(0).toISOString(),
    },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

export function getDemoGraveBonusSlots(username: string | null | undefined): number {
  if (!isDemoMode() || username?.toLowerCase() !== DEMO_USERNAME.toLowerCase()) return 0
  return DEMO_GRAVE_BONUS_SLOTS
}
