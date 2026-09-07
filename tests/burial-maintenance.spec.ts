import { expect, test } from '@playwright/test'
import { areBurialsPaused } from '../src/lib/burial-maintenance'

test('Preview cannot create graves with inherited production credentials by default', () => {
  for (const flag of [undefined, '', 'TRUE', 'invalid']) {
    expect(areBurialsPaused({ VERCEL_ENV: 'preview', CEMETERY_BURIALS_PAUSED: flag })).toBe(true)
  }
  expect(areBurialsPaused({ VERCEL_ENV: 'preview', CEMETERY_BURIALS_PAUSED: 'false' })).toBe(false)
})

test('maintenance remains explicit for production and local development', () => {
  for (const environment of [undefined, 'development', 'production']) {
    expect(areBurialsPaused({ VERCEL_ENV: environment })).toBe(false)
    expect(areBurialsPaused({ VERCEL_ENV: environment, CEMETERY_BURIALS_PAUSED: 'true' })).toBe(true)
    expect(areBurialsPaused({ VERCEL_ENV: environment, CEMETERY_BURIALS_PAUSED: 'false' })).toBe(false)
  }
})
