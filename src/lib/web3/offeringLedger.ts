import { GRAVE_TOKEN_DECIMALS } from '@/web3/config'
export interface GraveOffering {
  graveId: string
  graveName: string
  author: string | null
  amountRaw: string
}
export interface OfferingLedger {
  totalBurnedRaw: string
  burnCount: number
  authors: Array<{ author: string; buried: number; offeringsRaw: string }>
  causes: Array<{ cause: string; count: number }>
  graves: GraveOffering[]
  recent: Array<{ id: string; graveId: string; graveName: string; walletAddress: string; githubUsername: string | null; amountRaw: string; txHash: string; verifiedAt: string | null }>
  supply: { totalSupplyRaw: string; burnAddressBalanceRaw: string; percent: number; blockNumber: string } | null
}
export function formatGraveAmount(raw: string): string {
  // Display whole tokens without rounding up; keep raw amounts for arithmetic.
  return (BigInt(raw) / (10n ** BigInt(GRAVE_TOKEN_DECIMALS))).toLocaleString('en-US')
}
export function compareRawAmounts(a: string, b: string): number {
  const left = BigInt(a), right = BigInt(b)
  return left < right ? -1 : left > right ? 1 : 0
}
export function burnedSupplyPercent(burned: bigint, supply: bigint): number {
  if (supply <= 0n || burned < 0n) throw new Error('Invalid supply')
  return Math.min(100, Number(burned * 1_000_000n / supply) / 10_000)
}
