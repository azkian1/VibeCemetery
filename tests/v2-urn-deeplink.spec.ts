import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('v2 urn deep link waits for cremated records before marking the link handled', () => {
  const source = readFileSync('src/components/CemeteryAppV2.tsx', 'utf8')
  const effectStart = source.indexOf('useEffect(() => {', source.indexOf('const urnHandled'))
  const effectEnd = source.indexOf('  }, [state.slotPositions.length, state.crematedLoading', effectStart)
  const effect = source.slice(effectStart, effectEnd)

  expect(effect).toContain('state.slotPositions.length === 0 || state.crematedLoading')
  expect(effect.indexOf('const item = state.cremated.find')).toBeGreaterThan(-1)
  expect(effect.indexOf('const item = state.cremated.find')).toBeLessThan(effect.indexOf('urnHandled.current = urnId'))
})
