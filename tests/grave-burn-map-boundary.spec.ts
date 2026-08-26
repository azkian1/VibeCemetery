import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { GRAVE_BURN_PRESETS, maxGraveAmount } from '../src/web3/config'

const root = path.resolve(__dirname, '..')

test('wallet provider is scoped to CemeteryApp v1 and absent from global providers', () => {
  const v1 = fs.readFileSync(path.join(root, 'src/components/CemeteryApp.tsx'), 'utf8')
  const globalProviders = fs.readFileSync(path.join(root, 'src/components/AppProviders.tsx'), 'utf8')
  expect(v1).toContain('<Web3Provider>')
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

test('burn controls are compact by default and expose the requested labels', () => {
  const panel = fs.readFileSync(
    path.join(root, 'src/components/modals/grave/GraveBurnPanel.tsx'),
    'utf8',
  )
  expect(panel).toContain('const [expanded, setExpanded] = useState(false)')
  expect(panel).toContain('BURN $GRAVE')
  expect(panel).toContain("Wallet balance: {burn.balanceDisplay.split('.')[0]} GRAVE")
  expect(panel).toContain("color: '#c8a050', fontSize: 11")
  expect(panel).toContain('$GRAVE BURNED')
  expect(panel).toContain('wholeGraveDisplay(burn.stats.totalBurnedDisplay)')
  expect(panel).toContain('const controlsExpanded = expanded || burn.hasPendingTransfer')
  expect(panel).toContain('aria-expanded={controlsExpanded}')
  expect(panel).toContain('Destination: {GRAVE_BURN_ADDRESS}')
  expect(panel).toContain('key={graveId}')
  expect(panel).toContain('const maxSelected =')
})

test('burn presets stay whole while MAX preserves the complete raw balance', () => {
  expect(GRAVE_BURN_PRESETS).toEqual(['1000', '10000'])
  expect(maxGraveAmount(undefined)).toBeNull()
  expect(maxGraveAmount(null)).toBeNull()
  expect(maxGraveAmount(0n)).toBeNull()
  expect(maxGraveAmount(999n * 10n ** 18n)).toBeNull()
  expect(maxGraveAmount(1_000n * 10n ** 18n)).toBe('1000')
  expect(maxGraveAmount(5_000n * 10n ** 18n)).toBe('5000')
  expect(maxGraveAmount(7_218_756_791_683_357_334_207_263n))
    .toBe('7218756.791683357334207263')

  const burnHook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  expect(burnHook).toContain('parsed >= MIN_GRAVE_BURN_RAW')
  expect(burnHook).not.toContain('customAmount')

  const panel = fs.readFileSync(
    path.join(root, 'src/components/modals/grave/GraveBurnPanel.tsx'),
    'utf8',
  )
  expect(panel).not.toContain('Custom GRAVE amount')
  expect(panel).toContain("amount === '1000' ? '1K' : '10K'")
  expect(panel).toContain('burn.balanceRaw < GRAVE_BURN_PRESET_RAW[amount]')
  expect(panel).toContain('if (usingMax && maxAmount !== null && burnAmount !== maxAmount)')
  expect(panel).toContain('setBurnAmount(maxAmount)')
  expect(panel).toContain('&& (!usingMax || maxSelected)')
})

test('Supabase reads uint256-sized numeric columns as text', () => {
  const store = fs.readFileSync(path.join(root, 'src/lib/web3/burnStore.ts'), 'utf8')

  expect(store).toContain("'amount_raw::text'")
  expect(store).toContain('.select<string, DbRow>(INTENT_SELECT)')
  expect(store).toContain('.select<string, DbRow>(BURN_SELECT)')
  expect(store).toContain(".eq('status', 'created')")
  expect(store).toContain(".lte('expires_at', checkedAt)")
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
  expect(hook).toContain("kind: 'unknown_hash'")
  expect(hook.indexOf('saveStoredPendingTransfer(pendingStorageKey, ambiguousTransfer)'))
    .toBeLessThan(hook.indexOf('const hash = await writeContractAsync'))
  expect(hook).toContain('candidate.code === 4001')
  expect(hook).toContain('recoverUnknownHash(ambiguousTransfer, signal)')
  expect(hook).toContain('parseStoredPendingTransfer')
  expect(hook).toContain('isRetryableSubmissionError')
  expect(panel).toContain('!burn.hasPendingTransfer')
  expect(panel).toContain('Do not send another offering')
  expect(panel).toContain('Retry Verification')
  expect(panel).not.toContain('Clear only after checking BaseScan')
  expect(hook).not.toContain('clearPendingRecovery')
})

test('unknown-hash recovery survives reconnecting with another wallet', () => {
  const hook = fs.readFileSync(path.join(root, 'src/web3/useGraveBurn.ts'), 'utf8')
  expect(hook).toContain('if (pendingStorageKey && readStoredPendingTransfer(pendingStorageKey)) return')
  expect(hook).toContain('const restored = findStoredUnknownTransfer(graveId)')
  expect(hook).not.toContain('if (pendingStorageKey || restoredStorageKey) return')
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
