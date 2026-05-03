import { expect, test } from '@playwright/test'
import { canReadLastCommitForOwner } from '../src/app/api/github/last-commit/route'

test.describe('last commit authorization', () => {
  test('allows only the authenticated GitHub owner case-insensitively', () => {
    expect(canReadLastCommitForOwner('AzKian1', 'azkian1')).toBe(true)
    expect(canReadLastCommitForOwner('other-user', 'azkian1')).toBe(false)
  })
})
