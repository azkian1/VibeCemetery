import { expect, test } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { isValidGraveDate, hasOrderedGraveDates } from '../src/lib/grave-dates'

test('helper and server reject impossible dates rather than letting JavaScript normalize them', async () => {
  const helper = await import(pathToFileURL(resolve('src/agent/burial-helper.mjs')).href)
  const valid = ['2024-02-29', '2000-02-29T00:00:00Z', '2020-01-02T12:30:59.123+03:00', '2025-09-06', '2020-01-01T00:00:00+14:00']
  const invalid = ['2025-02-29', '1900-02-29', '2025-04-31', '0000-01-01', '2020-00-10', '2020-01-01T24:00:00Z', '2020-01-01T00:00:00', '2020-01-01T23:59:60Z', '2020-01-01T00:00:00+23:00', '2020-01-01T00:00:00+14:01', '', null, {}, 42]
  for (const value of [...valid, ...invalid]) {
    expect(isValidGraveDate(value), JSON.stringify(value)).toBe(valid.includes(value as string))
    expect(helper.isValidGraveDate(value)).toBe(isValidGraveDate(value))
  }
  expect(hasOrderedGraveDates('2020-01-02', '2020-01-01')).toBe(false)
  expect(hasOrderedGraveDates(null, '2020-01-01')).toBe(true)
  expect(() => helper.buildBurialBody({ name: 'Project', cause: 'Abandoned', project_key: 'sha256:' + 'a'.repeat(64), born_at: '2020-01-02', died_at: '2020-01-01' })).toThrow('precede')
})
