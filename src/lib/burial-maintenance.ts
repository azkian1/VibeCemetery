type BurialEnvironment = {
  [name: string]: string | undefined
  CEMETERY_BURIALS_PAUSED?: string
  VERCEL_ENV?: string
}

/** Preview often shares production credentials; opt in only after isolating its data. */
export function areBurialsPaused(env: BurialEnvironment): boolean {
  if (env.CEMETERY_BURIALS_PAUSED === 'true') return true
  if (env.CEMETERY_BURIALS_PAUSED === 'false') return false
  return env.VERCEL_ENV === 'preview'
}
