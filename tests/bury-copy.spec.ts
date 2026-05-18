import { expect, test } from '@playwright/test'
import { BURY_GITHUB_CONNECT_LABEL } from '../src/components/modals/bury/StepScan'

test('uses action-oriented GitHub connect copy in BURY flow', () => {
  expect(BURY_GITHUB_CONNECT_LABEL).toBe('Connect GitHub')
})
