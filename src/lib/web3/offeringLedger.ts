import { formatUnits } from 'viem'
import { GRAVE_TOKEN_DECIMALS } from '@/web3/config'
export interface OfferingLedger {
  totalBurnedRaw: string
  burnCount: number
  authors: Array<{ author: string; buried: number; offeringsRaw: string }>
  causes: Array<{ cause: string; count: number }>
  recent: Array<{ id: string; graveId: string; graveName: string; walletAddress: string; githubUsername: string | null; amountRaw: string; txHash: string; verifiedAt: string | null }>
  supply: { totalSupplyRaw: string; burnAddressBalanceRaw: string; percent: number; blockNumber: string } | null
}
export function formatGraveAmount(raw: string): string {
  return formatUnits(BigInt(raw), GRAVE_TOKEN_DECIMALS)
}
export function burnedSupplyPercent(burned: bigint, supply: bigint): number {
  if (supply <= 0n || burned < 0n) throw new Error('Invalid supply')
  return Math.min(100, Number(burned * 1_000_000n / supply) / 10_000)
}
