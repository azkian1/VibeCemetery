-- VibeCemetery: durable background recovery for a lost wallet transaction hash.
-- Apply once in Supabase after web3-grave-burn-v1-finish.sql.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.grave_burn_intents
  add column if not exists recovery_last_checked_at timestamptz,
  add column if not exists recovery_lease_until timestamptz,
  add column if not exists recovery_lease_token uuid,
  add column if not exists recovery_completed_at timestamptz,
  add column if not exists recovery_failure_code text;

create index if not exists grave_burn_intents_recovery_queue_idx
  on public.grave_burn_intents (
    recovery_completed_at,
    recovery_lease_until,
    recovery_last_checked_at,
    authorized_at
  )
  where status = 'authorized';

create or replace function public.claim_grave_burn_recoveries(
  p_limit integer,
  p_claimed_at timestamptz,
  p_lease_seconds integer,
  p_lease_token uuid
)
returns table (
  id uuid,
  grave_id uuid,
  wallet_address text,
  github_username text,
  amount_raw text,
  chain_id integer,
  token_address text,
  burn_address text,
  nonce text,
  status text,
  signature text,
  authorized_block_number text,
  authorized_block_hash text,
  authorization_verified_at timestamptz,
  expires_at timestamptz,
  authorized_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_claimed_at is null
     or p_limit < 1 or p_limit > 25
     or p_lease_seconds < 30 or p_lease_seconds > 900
     or p_lease_token is null then
    raise exception 'invalid grave burn recovery claim bounds';
  end if;

  return query
  with claimed as (
    select candidate.id
      from public.grave_burn_intents as candidate
     where candidate.status = 'authorized'
       and candidate.recovery_completed_at is null
       and (
         candidate.recovery_lease_until is null
         or candidate.recovery_lease_until <= p_claimed_at
       )
       and not exists (
         select 1
           from public.grave_burns as existing_burn
          where existing_burn.intent_id = candidate.id
       )
     order by
       coalesce(candidate.recovery_last_checked_at, candidate.authorized_at, candidate.created_at),
       candidate.id
     for update of candidate skip locked
     limit p_limit
  ), leased as (
    update public.grave_burn_intents as candidate
       set recovery_last_checked_at = p_claimed_at,
           recovery_lease_until = p_claimed_at
             + pg_catalog.make_interval(secs => p_lease_seconds),
           recovery_lease_token = p_lease_token
      from claimed
     where candidate.id = claimed.id
    returning candidate.*
  )
  select
    leased.id,
    leased.grave_id,
    leased.wallet_address,
    leased.github_username,
    leased.amount_raw::text,
    leased.chain_id,
    leased.token_address,
    leased.burn_address,
    leased.nonce,
    leased.status,
    leased.signature,
    leased.authorized_block_number::text,
    leased.authorized_block_hash,
    leased.authorization_verified_at,
    leased.expires_at,
    leased.authorized_at,
    leased.consumed_at,
    leased.created_at
  from leased;
end;
$$;

create or replace function public.finish_grave_burn_recovery(
  p_intent_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_failure_code text,
  p_checked_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_intent_id is null or p_lease_token is null or p_checked_at is null
     or p_outcome is null
     or p_outcome not in ('retry', 'safe_no_match', 'operator_required') then
    raise exception 'invalid grave burn recovery outcome';
  end if;

  update public.grave_burn_intents as candidate
     set recovery_last_checked_at = p_checked_at,
         recovery_lease_until = null,
         recovery_lease_token = null,
         recovery_completed_at = case
           when p_outcome in ('safe_no_match', 'operator_required') then p_checked_at
           else null
         end,
         recovery_failure_code = case
           when p_outcome = 'operator_required' then p_failure_code
           when p_outcome = 'safe_no_match' then 'no_transfer_found'
           else null
         end
   where candidate.id = p_intent_id
     and candidate.recovery_lease_token = p_lease_token
     and candidate.status = 'authorized'
     and not exists (
       select 1
         from public.grave_burns as existing_burn
        where existing_burn.intent_id = candidate.id
     );
end;
$$;

revoke all on function public.claim_grave_burn_recoveries(integer, timestamptz, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_grave_burn_recovery(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_grave_burn_recoveries(integer, timestamptz, integer, uuid)
  to service_role;
grant execute on function public.finish_grave_burn_recovery(uuid, uuid, text, text, timestamptz)
  to service_role;
