import { expect, test } from '@playwright/test'
import { parseCrematedListQuery } from '../src/app/api/cremated/route'

test.describe('cremated list query', () => {
  test('normalizes an author filter and bounds pagination', () => {
    expect(parseCrematedListQuery(new URLSearchParams({
      author: ' Octo-Cat ',
      limit: '9999',
      offset: '999999',
    }))).toEqual({
      ok: true,
      author: 'octo-cat',
      limit: 100,
      offset: 10_000,
    })
  })

  test('rejects invalid author filters and uses safe defaults for malformed pagination', () => {
    expect(parseCrematedListQuery(new URLSearchParams({ author: 'octocat/../../admin' }))).toEqual({
      ok: false,
      error: 'Invalid author',
    })
    expect(parseCrematedListQuery(new URLSearchParams({ limit: 'bad', offset: '-5' }))).toEqual({
      ok: true,
      author: null,
      limit: 100,
      offset: 0,
    })
  })
})
