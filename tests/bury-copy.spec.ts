import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BURY_GITHUB_CONNECT_LABEL } from '../src/components/modals/bury/StepScan'

test('uses action-oriented GitHub connect copy in BURY flow', () => {
  expect(BURY_GITHUB_CONNECT_LABEL).toBe('Connect GitHub')
})

test('explains the grave limit without alternative project records', async () => {
  const source = await readFile('src/components/modals/bury/StepSelect.tsx', 'utf8')

  expect(source).toContain('No grave slots left.')
  expect(source).not.toMatch(/cremat/i)
  expect(source).not.toContain(['Cremation is available from ', ['FI', 'RE'].join('')].join(''))
  expect(source).not.toContain([['SHO', 'VEL'].join(''), ' creates graves only'].join(''))
})
