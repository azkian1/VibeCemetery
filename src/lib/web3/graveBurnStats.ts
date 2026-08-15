import { formatUnits } from 'viem'
import { GRAVE_TOKEN_DECIMALS } from '@/web3/config'

export interface VerifiedBurnForStats {
  walletAddress: string
  githubUsername: string | null
  amountRaw: string
  verifiedAt: string | null
  createdAt: string
}

export type GraveBurnStats = {
  totalBurnedRaw: string
  totalBurnedDisplay: string
  burnCount: number
  topMourners: Array<{
    walletAddress: string
    displayName: string
    githubUsername: string | null
    amountRaw: string
    amountDisplay: string
    source: 'github' | 'wallet'
  }>
}

export function shortenWalletAddress(address: string): string {
  if (address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function displayAmount(raw: bigint): string {
  const formatted = formatUnits(raw, GRAVE_TOKEN_DECIMALS)
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
}

export function graveBurnStatsFromAggregate(input: {
  totalBurnedRaw: string
  burnCount: number
  topMourners: Array<{
    walletAddress: string
    githubUsername: string | null
    amountRaw: string
  }>
}): GraveBurnStats {
  return {
    totalBurnedRaw: input.totalBurnedRaw,
    totalBurnedDisplay: displayAmount(BigInt(input.totalBurnedRaw)),
    burnCount: input.burnCount,
    topMourners: input.topMourners.map((mourner) => ({
      walletAddress: mourner.walletAddress,
      displayName:
        mourner.githubUsername ?? shortenWalletAddress(mourner.walletAddress),
      githubUsername: mourner.githubUsername,
      amountRaw: mourner.amountRaw,
      amountDisplay: displayAmount(BigInt(mourner.amountRaw)),
      source: mourner.githubUsername ? 'github' as const : 'wallet' as const,
    })),
  }
}

export function aggregateGraveBurnStats(
  verifiedBurns: readonly VerifiedBurnForStats[],
): GraveBurnStats {
  let total = 0n
  const mourners = new Map<string, {
    amount: bigint
    latestGithubUsername: string | null
    latestGithubTimestamp: number
  }>()

  for (const burn of verifiedBurns) {
    const wallet = burn.walletAddress.toLowerCase()
    const amount = BigInt(burn.amountRaw)
    total += amount

    const current = mourners.get(wallet) ?? {
      amount: 0n,
      latestGithubUsername: null,
      latestGithubTimestamp: -1,
    }
    current.amount += amount

    if (burn.githubUsername) {
      const timestamp = Date.parse(burn.verifiedAt ?? burn.createdAt)
      if (
        timestamp > current.latestGithubTimestamp
        || (
          timestamp === current.latestGithubTimestamp
          && burn.githubUsername.localeCompare(current.latestGithubUsername ?? '') < 0
        )
      ) {
        current.latestGithubUsername = burn.githubUsername
        current.latestGithubTimestamp = timestamp
      }
    }
    mourners.set(wallet, current)
  }

  const topMourners = [...mourners.entries()]
    .sort(([leftAddress, left], [rightAddress, right]) => {
      if (left.amount !== right.amount) return left.amount > right.amount ? -1 : 1
      return leftAddress.localeCompare(rightAddress)
    })
    .slice(0, 3)
    .map(([walletAddress, mourner]) => {
      const githubUsername = mourner.latestGithubUsername
      return {
        walletAddress,
        displayName: githubUsername ?? shortenWalletAddress(walletAddress),
        githubUsername,
        amountRaw: mourner.amount.toString(),
        amountDisplay: displayAmount(mourner.amount),
        source: githubUsername ? 'github' as const : 'wallet' as const,
      }
    })

  return {
    totalBurnedRaw: total.toString(),
    totalBurnedDisplay: displayAmount(total),
    burnCount: verifiedBurns.length,
    topMourners,
  }
}
