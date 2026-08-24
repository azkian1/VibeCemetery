import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')

test('wallet provider is scoped to CemeteryApp v1 and absent from v2 and global providers', () => {
  const v1 = fs.readFileSync(path.join(root, 'src/components/CemeteryApp.tsx'), 'utf8')
  const v2 = fs.readFileSync(path.join(root, 'src/components/CemeteryAppV2.tsx'), 'utf8')
  const globalProviders = fs.readFileSync(path.join(root, 'src/components/AppProviders.tsx'), 'utf8')
  expect(v1).toContain('<Web3Provider>')
  expect(v2).not.toContain('Web3Provider')
  expect(globalProviders).not.toContain('Web3Provider')
})

test('shared grave modal renders the burn panel only for a real v1 grave', () => {
  const modal = fs.readFileSync(path.join(root, 'src/components/modals/GraveModal.tsx'), 'utf8')
  const store = fs.readFileSync(path.join(root, 'src/lib/web3/burnStore.ts'), 'utf8')
  expect(modal).toContain("mapVersion === 'v1' && slotId != null")
  expect(modal).toContain('<GraveBurnPanel graveId={g.id} slotId={slotId}')
  expect(store).toContain(".eq('map_version', 'v1')")
  expect(store).not.toContain(".eq('map_version', 'v2')")
})

test('feature flag exits before any Wagmi hook executes', () => {
  const panel = fs.readFileSync(
    path.join(root, 'src/components/modals/grave/GraveBurnPanel.tsx'),
    'utf8',
  )
  const guard = panel.indexOf("if (!WEB3_GRAVE_BURNS_VISIBLE || mapVersion !== 'v1') return null")
  const enabledComponent = panel.indexOf('function EnabledGraveBurnPanel')
  const wagmiHook = panel.indexOf('const connection = useConnection()', enabledComponent)
  expect(guard).toBeGreaterThan(-1)
  expect(enabledComponent).toBeGreaterThan(guard)
  expect(wagmiHook).toBeGreaterThan(enabledComponent)
})

test('offering copy discloses irreversible transfer semantics and fixed addresses', () => {
  const panel = fs.readFileSync(
    path.join(root, 'src/components/modals/grave/GraveBurnPanel.tsx'),
    'utf8',
  )
  expect(panel).toContain('Irreversibly transfers GRAVE to the dead address on Base')
  expect(panel).toContain('does not reduce the token&apos;s totalSupply')
  expect(panel).toContain('GRAVE_TOKEN_ADDRESS')
  expect(panel).toContain('GRAVE_BURN_ADDRESS')
})

test('pending polling owns an abort controller and cleans it up', () => {
  const hook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  expect(hook).toContain('const activeBurnAbortRef = useRef<AbortController | null>(null)')
  expect(hook).toContain("signal.addEventListener('abort'")
  expect(hook).toContain('activeBurnAbortRef.current?.abort()')
  expect(hook).toContain('signal,')
})

test('a submitted wallet transfer cannot silently trigger a second burn', () => {
  const hook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  const panel = fs.readFileSync(
    path.join(root, 'src/components/modals/grave/GraveBurnPanel.tsx'),
    'utf8',
  )
  expect(hook).toContain('setExplorerUrl(`${BASE_EXPLORER_TX_URL}${hash}`)')
  expect(hook).toContain('setPendingTransfer(submittedTransfer)')
  expect(hook).toContain('saveStoredPendingTransfer')
  expect(hook).toContain('Verification must continue without it')
  expect(hook).toContain('parseStoredPendingTransfer')
  expect(hook).toContain('isRetryableSubmissionError')
  expect(panel).toContain('!burn.hasPendingTransfer')
  expect(panel).toContain('Do not send another offering')
  expect(panel).toContain('Retry Verification')
  expect(panel).toContain('Clear only after checking BaseScan')
})

test('client submits only intentId and txHash after the transfer', () => {
  const hook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  expect(hook).toContain('JSON.stringify({ intentId, txHash: hash })')
  expect(hook).not.toContain('txHash: hash, walletAddress')
  expect(hook).not.toContain('githubUsername')
})

test('map highlight is emitted only from verified completion', () => {
  const hook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  const completion = hook.slice(
    hook.indexOf('const completeVerified'),
    hook.indexOf('const pollPending'),
  )
  expect(completion).toContain("cemeteryEvents.emit('highlight_slot'")
  expect(hook.match(/cemeteryEvents\.emit\('highlight_slot'/g)).toHaveLength(1)
})
