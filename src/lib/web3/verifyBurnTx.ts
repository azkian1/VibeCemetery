import {
  decodeEventLog,
  getAddress,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import { graveTokenAbi } from '@/web3/abi'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  MIN_BURN_CONFIRMATIONS,
} from '@/web3/config'
import {
  buildGraveBurnTypedData,
  type GraveBurnIntentRecord,
} from './burnIntent'

export interface BurnVerificationClient {
  getChainId(): Promise<number>
  getTransactionReceipt(args: { hash: Hex }): Promise<{
    status: 'success' | 'reverted'
    blockNumber: bigint
    blockHash: Hex
    logs: readonly Log[]
  }>
  getTransaction(args: { hash: Hex }): Promise<{ from: Address }>
  getBlockNumber(): Promise<bigint>
  getBlock(args: { blockNumber: bigint }): Promise<{
    hash: Hex | null
    timestamp: bigint
  }>
  getBytecode(args: { address: Address; blockNumber?: bigint }): Promise<Hex | undefined>
  verifyTypedData(args: ReturnType<typeof buildGraveBurnTypedData> & {
    address: Address
    signature: Hex
    blockNumber?: bigint
  }): Promise<boolean>
}

export type BurnVerificationArtifact = {
  blockNumber: string
  blockHash: Hex
  logIndex: number
}

export type BurnVerificationResult =
  | {
      status: 'pending'
      bind: false
      failureCode: 'receipt_not_found'
    }
  | {
      status: 'pending' | 'verified'
      bind: true
      artifact: BurnVerificationArtifact
    }
  | {
      status: 'failed' | 'orphaned'
      bind: false
      failureCode: string
    }

function isReceiptNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'TransactionReceiptNotFoundError'
    || /transaction receipt.*not found|could not be found/i.test(error.message)
  )
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function decodeMatchingTransferLogs(
  logs: readonly Log[],
  intent: GraveBurnIntentRecord,
): Array<{ logIndex: number }> {
  const matches: Array<{ logIndex: number }> = []

  for (const log of logs) {
    if (!sameAddress(log.address, GRAVE_TOKEN_ADDRESS)) continue

    try {
      const decoded = decodeEventLog({
        abi: graveTokenAbi,
        eventName: 'Transfer',
        data: log.data,
        topics: log.topics,
        strict: true,
      })
      const args = decoded.args
      if (
        sameAddress(args.from, intent.walletAddress)
        && sameAddress(args.to, GRAVE_BURN_ADDRESS)
        && args.value === BigInt(intent.amountRaw)
        && log.logIndex !== null
      ) {
        matches.push({ logIndex: log.logIndex })
      }
    } catch {
      // An unrelated token log at the fixed contract is not a matching Transfer.
    }
  }

  return matches
}

export async function verifyBurnTx({
  client,
  intent,
  txHash,
}: {
  client: BurnVerificationClient
  intent: GraveBurnIntentRecord
  txHash: Hex
}): Promise<BurnVerificationResult> {
  if (
    intent.chainId !== GRAVE_CHAIN_ID
    || !sameAddress(intent.tokenAddress, GRAVE_TOKEN_ADDRESS)
    || !sameAddress(intent.burnAddress, GRAVE_BURN_ADDRESS)
    || intent.status !== 'authorized'
    || !intent.signature
    || !intent.authorizedBlockNumber
  ) {
    return { status: 'failed', bind: false, failureCode: 'invalid_intent' }
  }

  if (await client.getChainId() !== GRAVE_CHAIN_ID) {
    return { status: 'failed', bind: false, failureCode: 'wrong_chain' }
  }

  let receipt: Awaited<ReturnType<BurnVerificationClient['getTransactionReceipt']>>
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash })
  } catch (error) {
    if (isReceiptNotFound(error)) {
      return { status: 'pending', bind: false, failureCode: 'receipt_not_found' }
    }
    throw error
  }

  if (receipt.status !== 'success') {
    return { status: 'failed', bind: false, failureCode: 'transaction_reverted' }
  }

  const authorizedBlockNumber = BigInt(intent.authorizedBlockNumber)
  if (receipt.blockNumber <= authorizedBlockNumber) {
    return { status: 'failed', bind: false, failureCode: 'pre_authorization_block' }
  }

  const [transaction, latestBlockNumber, receiptBlock, walletBytecode] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getBlockNumber(),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBytecode({
      address: getAddress(intent.walletAddress),
      blockNumber: receipt.blockNumber,
    }),
  ])

  if (!receiptBlock.hash || receiptBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    return { status: 'orphaned', bind: false, failureCode: 'block_hash_mismatch' }
  }

  const expiresAtSeconds = BigInt(Math.floor(new Date(intent.expiresAt).getTime() / 1000))
  const authorizedAtSeconds = BigInt(Math.floor(
    new Date(intent.authorizationVerifiedAt ?? intent.authorizedAt ?? intent.createdAt).getTime() / 1000,
  ))
  if (receiptBlock.timestamp < authorizedAtSeconds) {
    return { status: 'failed', bind: false, failureCode: 'pre_authorization_timestamp' }
  }
  if (receiptBlock.timestamp > expiresAtSeconds) {
    return { status: 'failed', bind: false, failureCode: 'intent_expired' }
  }

  const isContractWallet = Boolean(walletBytecode && walletBytecode !== '0x')
  if (isContractWallet) {
    const signatureStillValid = await client.verifyTypedData({
      address: getAddress(intent.walletAddress),
      ...buildGraveBurnTypedData(intent),
      signature: intent.signature,
      blockNumber: receipt.blockNumber,
    })
    if (!signatureStillValid) {
      return { status: 'failed', bind: false, failureCode: 'smart_wallet_signature_invalid' }
    }
  } else if (!sameAddress(transaction.from, intent.walletAddress)) {
    return { status: 'failed', bind: false, failureCode: 'wrong_transaction_sender' }
  }

  const matchingLogs = decodeMatchingTransferLogs(receipt.logs, intent)
  if (matchingLogs.length !== 1) {
    return {
      status: 'failed',
      bind: false,
      failureCode: matchingLogs.length === 0 ? 'matching_transfer_missing' : 'multiple_matching_transfers',
    }
  }

  const confirmations =
    latestBlockNumber >= receipt.blockNumber
      ? latestBlockNumber - receipt.blockNumber + 1n
      : 0n

  const artifact: BurnVerificationArtifact = {
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    logIndex: matchingLogs[0].logIndex,
  }

  if (confirmations < BigInt(MIN_BURN_CONFIRMATIONS)) {
    return { status: 'pending', bind: true, artifact }
  }

  return { status: 'verified', bind: true, artifact }
}

export type StoredBurnCanonicality = 'canonical' | 'orphaned' | 'unavailable'

export async function checkStoredBurnCanonicality({
  client,
  blockNumber,
  blockHash,
}: {
  client: Pick<BurnVerificationClient, 'getBlock'>
  blockNumber: string
  blockHash: Hex
}): Promise<StoredBurnCanonicality> {
  try {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) })
    if (!block.hash) return 'unavailable'
    return block.hash.toLowerCase() === blockHash.toLowerCase()
      ? 'canonical'
      : 'orphaned'
  } catch {
    return 'unavailable'
  }
}
