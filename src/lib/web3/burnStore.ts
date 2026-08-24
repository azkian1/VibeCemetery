import 'server-only'
import type { Hex } from 'viem'
import { supabaseAdmin } from '@/lib/supabase'
import type { GraveBurnIntentRecord } from './burnIntent'
import {
  graveBurnStatsFromAggregate,
  type GraveBurnStats,
} from './graveBurnStats'
import type { BurnVerificationArtifact } from './verifyBurnTx'

export type GraveLookupResult = 'found' | 'not_found' | 'schema_unavailable'
export type BurnStatus = 'pending' | 'verified' | 'failed' | 'orphaned'

export interface GraveBurnRecord {
  id: string
  intentId: string
  graveId: string
  walletAddress: string
  githubUsername: string | null
  txHash: Hex
  amountRaw: string
  status: BurnStatus
  blockNumber: string | null
  blockHash: Hex | null
  logIndex: number | null
  submittedAt: string
  verifiedAt: string | null
  lastCheckedAt: string
  createdAt: string
}

export interface CreateIntentInput {
  id: string
  graveId: string
  walletAddress: string
  amountRaw: string
  nonce: string
  expiresAt: string
  createdAt: string
}

export type AuthorizeIntentOutcome =
  | 'authorized'
  | 'already_authorized'
  | 'expired'
  | 'invalid_state'
  | 'not_found'

export type BindBurnOutcome =
  | { outcome: 'bound' | 'existing'; status: BurnStatus }
  | { outcome: 'conflict' | 'invalid_state' | 'expired' | 'not_found' }

export interface GraveBurnStore {
  findBurnableV1Grave(graveId: string): Promise<GraveLookupResult>
  createIntent(input: CreateIntentInput): Promise<GraveBurnIntentRecord>
  getIntent(graveId: string, intentId: string): Promise<GraveBurnIntentRecord | null>
  expireIntentAtomic(input: {
    graveId: string
    intentId: string
    checkedAt: string
  }): Promise<void>
  authorizeIntentAtomic(input: {
    graveId: string
    intentId: string
    signature: Hex
    authorizedBlockNumber: string
    authorizedBlockHash: Hex
    authorizationVerifiedAt: string
    githubUsername: string | null
  }): Promise<AuthorizeIntentOutcome>
  bindBurnAtomic(input: {
    graveId: string
    intentId: string
    txHash: Hex
    status: 'pending' | 'verified'
    artifact: BurnVerificationArtifact | null
    checkedAt: string
  }): Promise<BindBurnOutcome>
  getBurnByIntent(intentId: string): Promise<GraveBurnRecord | null>
  getVerifiedBurnStats(graveId: string): Promise<GraveBurnStats>
  listReverifyCandidates(limit: number): Promise<Array<{
    burn: GraveBurnRecord
    intent: GraveBurnIntentRecord
  }>>
  updateReverifiedBurn(input: {
    burnId: string
    status: BurnStatus
    artifact: BurnVerificationArtifact | null
    failureCode: string | null
    checkedAt: string
  }): Promise<void>
}

type DbRow = Record<string, unknown>

// PostgREST otherwise serializes numeric(78, 0) as a JSON number. Once the
// value reaches 1e21, JSON.parse turns it into an imprecise JS Number and
// String(value) may produce scientific notation, which viem cannot encode as
// uint256. Select uint256-sized values as text at the database edge.
const INTENT_SELECT = [
  'id',
  'grave_id',
  'wallet_address',
  'github_username',
  'amount_raw::text',
  'chain_id',
  'token_address',
  'burn_address',
  'nonce',
  'status',
  'signature',
  'authorized_block_number::text',
  'authorized_block_hash',
  'authorization_verified_at',
  'expires_at',
  'authorized_at',
  'consumed_at',
  'created_at',
].join(',')

const BURN_SELECT = [
  'id',
  'intent_id',
  'grave_id',
  'wallet_address',
  'github_username',
  'tx_hash',
  'amount_raw::text',
  'status',
  'block_number::text',
  'block_hash',
  'log_index',
  'submitted_at',
  'verified_at',
  'last_checked_at',
  'created_at',
].join(',')

function asNullableString(value: unknown): string | null {
  return value == null ? null : String(value)
}

function mapIntent(row: DbRow): GraveBurnIntentRecord {
  return {
    id: String(row.id),
    graveId: String(row.grave_id),
    walletAddress: String(row.wallet_address) as GraveBurnIntentRecord['walletAddress'],
    githubUsername: asNullableString(row.github_username),
    amountRaw: String(row.amount_raw),
    chainId: Number(row.chain_id),
    tokenAddress: String(row.token_address) as GraveBurnIntentRecord['tokenAddress'],
    burnAddress: String(row.burn_address) as GraveBurnIntentRecord['burnAddress'],
    nonce: String(row.nonce),
    status: String(row.status) as GraveBurnIntentRecord['status'],
    signature: asNullableString(row.signature) as Hex | null,
    authorizedBlockNumber: asNullableString(row.authorized_block_number),
    authorizedBlockHash: asNullableString(row.authorized_block_hash) as Hex | null,
    authorizationVerifiedAt: asNullableString(row.authorization_verified_at),
    expiresAt: String(row.expires_at),
    authorizedAt: asNullableString(row.authorized_at),
    consumedAt: asNullableString(row.consumed_at),
    createdAt: String(row.created_at),
  }
}

function mapBurn(row: DbRow): GraveBurnRecord {
  return {
    id: String(row.id),
    intentId: String(row.intent_id),
    graveId: String(row.grave_id),
    walletAddress: String(row.wallet_address),
    githubUsername: asNullableString(row.github_username),
    txHash: String(row.tx_hash) as Hex,
    amountRaw: String(row.amount_raw),
    status: String(row.status) as BurnStatus,
    blockNumber: asNullableString(row.block_number),
    blockHash: asNullableString(row.block_hash) as Hex | null,
    logIndex: row.log_index == null ? null : Number(row.log_index),
    submittedAt: String(row.submitted_at),
    verifiedAt: asNullableString(row.verified_at),
    lastCheckedAt: String(row.last_checked_at),
    createdAt: String(row.created_at),
  }
}

export class SupabaseGraveBurnStore implements GraveBurnStore {
  async findBurnableV1Grave(graveId: string): Promise<GraveLookupResult> {
    const { data, error } = await supabaseAdmin
      .from('graves')
      .select('id')
      .eq('id', graveId)
      .eq('map_version', 'v1')
      .maybeSingle()

    if (error) {
      if (/map_version|column .* does not exist|schema cache/i.test(error.message)) {
        return 'schema_unavailable'
      }
      throw error
    }
    return data ? 'found' : 'not_found'
  }

  async createIntent(input: CreateIntentInput): Promise<GraveBurnIntentRecord> {
    const { data, error } = await supabaseAdmin
      .from('grave_burn_intents')
      .insert({
        id: input.id,
        grave_id: input.graveId,
        wallet_address: input.walletAddress.toLowerCase(),
        amount_raw: input.amountRaw,
        chain_id: 8453,
        token_address: '0xb48bc4896d18724f7bf5a3d2817fc35252cd7ba3',
        burn_address: '0x000000000000000000000000000000000000dead',
        nonce: input.nonce,
        status: 'created',
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      })
      .select<string, DbRow>(INTENT_SELECT)
      .single()

    if (error) throw error
    return mapIntent(data as DbRow)
  }

  async getIntent(graveId: string, intentId: string): Promise<GraveBurnIntentRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('grave_burn_intents')
      .select<string, DbRow>(INTENT_SELECT)
      .eq('id', intentId)
      .eq('grave_id', graveId)
      .maybeSingle()

    if (error) throw error
    return data ? mapIntent(data as DbRow) : null
  }

  async expireIntentAtomic(input: {
    graveId: string
    intentId: string
    checkedAt: string
  }): Promise<void> {
    const { error } = await supabaseAdmin.rpc('expire_grave_burn_intent', {
      p_grave_id: input.graveId,
      p_intent_id: input.intentId,
      p_checked_at: input.checkedAt,
    })
    if (error) throw error
  }

  async authorizeIntentAtomic(input: {
    graveId: string
    intentId: string
    signature: Hex
    authorizedBlockNumber: string
    authorizedBlockHash: Hex
    authorizationVerifiedAt: string
    githubUsername: string | null
  }): Promise<AuthorizeIntentOutcome> {
    const { data, error } = await supabaseAdmin.rpc('authorize_grave_burn_intent', {
      p_grave_id: input.graveId,
      p_intent_id: input.intentId,
      p_signature: input.signature,
      p_authorized_block_number: input.authorizedBlockNumber,
      p_authorized_block_hash: input.authorizedBlockHash.toLowerCase(),
      p_authorization_verified_at: input.authorizationVerifiedAt,
      p_github_username: input.githubUsername,
    })
    if (error) throw error
    return String((data as DbRow | null)?.outcome ?? 'invalid_state') as AuthorizeIntentOutcome
  }

  async bindBurnAtomic(input: {
    graveId: string
    intentId: string
    txHash: Hex
    status: 'pending' | 'verified'
    artifact: BurnVerificationArtifact | null
    checkedAt: string
  }): Promise<BindBurnOutcome> {
    const { data, error } = await supabaseAdmin.rpc('bind_grave_burn', {
      p_grave_id: input.graveId,
      p_intent_id: input.intentId,
      p_tx_hash: input.txHash.toLowerCase(),
      p_status: input.status,
      p_block_number: input.artifact?.blockNumber ?? null,
      p_block_hash: input.artifact?.blockHash.toLowerCase() ?? null,
      p_log_index: input.artifact?.logIndex ?? null,
      p_transfer_block_timestamp: input.artifact?.blockTimestamp ?? null,
      p_checked_at: input.checkedAt,
    })
    if (error) throw error

    const result = data as DbRow | null
    const outcome = String(result?.outcome ?? 'invalid_state')
    if (outcome === 'bound' || outcome === 'existing') {
      return {
        outcome,
        status: String(result?.burn_status ?? input.status) as BurnStatus,
      }
    }
    return { outcome: outcome as 'conflict' | 'invalid_state' | 'expired' | 'not_found' }
  }

  async getBurnByIntent(intentId: string): Promise<GraveBurnRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('grave_burns')
      .select<string, DbRow>(BURN_SELECT)
      .eq('intent_id', intentId)
      .maybeSingle()
    if (error) throw error
    return data ? mapBurn(data as DbRow) : null
  }

  async getVerifiedBurnStats(graveId: string): Promise<GraveBurnStats> {
    const { data, error } = await supabaseAdmin.rpc('get_grave_burn_stats', {
      p_grave_id: graveId,
    })
    if (error) throw error

    const result = (data ?? {}) as DbRow
    const topMourners = Array.isArray(result.topMourners)
      ? result.topMourners
      : []
    return graveBurnStatsFromAggregate({
      totalBurnedRaw: String(result.totalBurnedRaw ?? '0'),
      burnCount: Number(result.burnCount ?? 0),
      topMourners: topMourners.map((mourner) => {
        const row = mourner as DbRow
        return {
          walletAddress: String(row.walletAddress),
          githubUsername: asNullableString(row.githubUsername),
          amountRaw: String(row.amountRaw),
        }
      }),
    })
  }

  async listReverifyCandidates(limit: number): Promise<Array<{
    burn: GraveBurnRecord
    intent: GraveBurnIntentRecord
  }>> {
    const { data: burns, error } = await supabaseAdmin
      .from('grave_burns')
      .select<string, DbRow>(BURN_SELECT)
      .in('status', ['pending', 'verified'])
      .order('last_checked_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    if (!burns?.length) return []

    const intentIds = burns.map((burn) => String(burn.intent_id))
    const { data: intents, error: intentsError } = await supabaseAdmin
      .from('grave_burn_intents')
      .select<string, DbRow>(INTENT_SELECT)
      .in('id', intentIds)
    if (intentsError) throw intentsError

    const intentsById = new Map(
      (intents ?? []).map((intent) => [String(intent.id), mapIntent(intent as DbRow)]),
    )
    return burns.flatMap((burnRow) => {
      const burn = mapBurn(burnRow as DbRow)
      const intent = intentsById.get(burn.intentId)
      return intent ? [{ burn, intent: { ...intent, status: 'authorized' as const } }] : []
    })
  }

  async updateReverifiedBurn(input: {
    burnId: string
    status: BurnStatus
    artifact: BurnVerificationArtifact | null
    failureCode: string | null
    checkedAt: string
  }): Promise<void> {
    const { error } = await supabaseAdmin.rpc('reverify_grave_burn', {
      p_burn_id: input.burnId,
      p_status: input.status,
      p_block_number: input.artifact?.blockNumber ?? null,
      p_block_hash: input.artifact?.blockHash.toLowerCase() ?? null,
      p_log_index: input.artifact?.logIndex ?? null,
      p_failure_code: input.failureCode,
      p_checked_at: input.checkedAt,
    })
    if (error) throw error
  }
}

export const graveBurnStore = new SupabaseGraveBurnStore()
