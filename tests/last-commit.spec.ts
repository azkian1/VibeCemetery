import { expect, test } from '@playwright/test'
import { canReadLastCommitForOwner, normalizeLastCommitMessage } from '../src/app/api/github/last-commit/route'

test.describe('last commit authorization', () => {
  test('allows only the authenticated GitHub owner case-insensitively', () => {
    expect(canReadLastCommitForOwner('AzKian1', 'azkian1')).toBe(true)
    expect(canReadLastCommitForOwner('other-user', 'azkian1')).toBe(false)
  })

  test('caps commit messages returned to the client', () => {
    const message = normalizeLastCommitMessage('A'.repeat(600))

    expect(message).toBe('A'.repeat(500))
  })

  test('sanitizes commit messages returned to the client', () => {
    const message = normalizeLastCommitMessage('<b>final</b>\u0000\u202E\u200B commit')

    expect(message).toBe('final commit')
  })
})
