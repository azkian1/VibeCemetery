import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  abortLatestRequest,
  beginLatestRequest,
  createLatestRequestState,
  finishLatestRequest,
  isLatestRequest,
} from '../src/lib/latest-request'

test('latest request guard aborts stale work without clearing the current request', () => {
  const state = createLatestRequestState()
  const first = beginLatestRequest(state)
  const second = beginLatestRequest(state)

  expect(first.controller.signal.aborted).toBe(true)
  expect(isLatestRequest(state, first)).toBe(false)
  expect(isLatestRequest(state, second)).toBe(true)

  finishLatestRequest(state, first)
  expect(state.controller).toBe(second.controller)

  finishLatestRequest(state, second)
  expect(state.controller).toBeNull()

  abortLatestRequest(state)
  expect(isLatestRequest(state, second)).toBe(false)
})

test('latest request guard ignores a stale response that settles after a newer one starts', () => {
  const state = createLatestRequestState()
  const first = beginLatestRequest(state)
  const second = beginLatestRequest(state)
  let displayedVoteIds: string[] = []

  if (isLatestRequest(state, first)) displayedVoteIds = ['from-prior-user']
  if (isLatestRequest(state, second)) displayedVoteIds = ['from-current-user']

  expect(displayedVoteIds).toEqual(['from-current-user'])
})

test('shared cemetery loaders dispatch only the latest guarded request', () => {
  const source = readFileSync('src/context/GameContext.tsx', 'utf8')
  const dispatchBlock = source.slice(
    source.indexOf('const dispatch = useCallback'),
    source.indexOf('const { data: session, status } = useSession()'),
  )

  expect(source).toContain('beginLatestRequest(gravesRequestStateRef.current)')
  expect(source).toContain('beginLatestRequest(crematedRequestStateRef.current)')
  expect(source).toContain('signal: request.controller.signal')
  expect(source).toContain('isLatestRequest(gravesRequestStateRef.current, request)')
  expect(source).toContain('isLatestRequest(crematedRequestStateRef.current, request)')
  expect(source).toContain('abortLatestRequest(gravesRequestStateRef.current)')
  expect(source).toContain('abortLatestRequest(crematedRequestStateRef.current)')
  expect(dispatchBlock).toContain("action.type === 'ADD_GRAVE'")
  expect(dispatchBlock).toContain("action.type === 'ADD_CREMATED'")
})

test('F-status requests are bound to the active session and invalidated on account changes', () => {
  const source = readFileSync('src/context/GameContext.tsx', 'utf8')
  const dispatchBlock = source.slice(
    source.indexOf('const dispatch = useCallback'),
    source.indexOf('const { data: session, status } = useSession()'),
  )

  expect(dispatchBlock).toContain("action.type === 'SET_USER'")
  expect(dispatchBlock).toContain('abortLatestRequest(fStatusRequestStateRef.current)')
  expect(source).toContain("const sessionUsername = status === 'authenticated'")
  expect(source).toContain('currentUser !== sessionUsername')
  expect(source).toContain('beginLatestRequest(fStatusRequestState)')
  expect(source).toContain('isLatestRequest(fStatusRequestState, request)')
  expect(source).toContain('signal: request.controller.signal')
})
