-- Focused, idempotent hardening migration for the GRAVE Burn v1 pre-release.
-- Apply only after the read-only preflight in the v1 finish runbook.
-- This file does not create the base burn schema; web3-grave-burn-mvp.sql must
-- already be installed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists grave_burn_intents_created_expiry_idx
  on public.grave_burn_intents (expires_at)
  where status = 'created';

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'grave_burn_intents_amount_uint256'
       and conrelid = 'public.grave_burn_intents'::regclass
  ) then
    alter table public.grave_burn_intents
      add constraint grave_burn_intents_amount_uint256 check (
        amount_raw <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'grave_burns_amount_uint256'
       and conrelid = 'public.grave_burns'::regclass
  ) then
    alter table public.grave_burns
      add constraint grave_burns_amount_uint256 check (
        amount_raw <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
      ) not valid;
  end if;
end;
$migration$;

alter table public.grave_burn_intents
  validate constraint grave_burn_intents_amount_uint256;
alter table public.grave_burns
  validate constraint grave_burns_amount_uint256;

create or replace function public.expire_grave_burn_intent(
  p_grave_id uuid,
  p_intent_id uuid,
  p_checked_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.grave_burn_intents
     set status = 'expired'
   where id = p_intent_id
     and grave_id = p_grave_id
     and status = 'created'
     and expires_at <= p_checked_at;
end;
$$;

create or replace function public.bind_grave_burn(
  p_grave_id uuid,
  p_intent_id uuid,
  p_tx_hash text,
  p_status text,
  p_block_number numeric,
  p_block_hash text,
  p_log_index integer,
  p_transfer_block_timestamp timestamptz,
  p_checked_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_intent public.grave_burn_intents%rowtype;
  existing_burn public.grave_burns%rowtype;
begin
  if p_status not in ('pending', 'verified') then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  if num_nonnulls(
    p_block_number,
    p_block_hash,
    p_log_index,
    p_transfer_block_timestamp
  ) not in (0, 4) then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  if p_status = 'verified' and p_block_number is null then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(p_tx_hash), 0));

  select *
    into locked_intent
    from public.grave_burn_intents
   where id = p_intent_id and grave_id = p_grave_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select *
    into existing_burn
    from public.grave_burns
   where intent_id = p_intent_id;

  if found then
    if existing_burn.tx_hash = lower(p_tx_hash) then
      return jsonb_build_object('outcome', 'existing', 'burn_status', existing_burn.status);
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if locked_intent.status <> 'authorized' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  if p_transfer_block_timestamp is null then
    -- Preserve an already-broadcast hash even after the wall-clock deadline.
    -- Reverification will enforce the canonical block-time window.
    null;
  else
    if p_transfer_block_timestamp < locked_intent.authorization_verified_at then
      return jsonb_build_object('outcome', 'invalid_state');
    end if;

    if p_transfer_block_timestamp > locked_intent.expires_at then
      update public.grave_burn_intents
         set status = 'expired'
       where id = p_intent_id;
      return jsonb_build_object('outcome', 'expired');
    end if;
  end if;

  select *
    into existing_burn
    from public.grave_burns
   where tx_hash = lower(p_tx_hash)
   for update;

  if found then
    -- A receipt-less submission is only a recovery hint, not permanent
    -- ownership of a globally unique transaction hash. Once the server has a
    -- fully verified receipt artifact for the correct signed intent, replace
    -- a conflicting artifact-less claim atomically. This prevents a copied
    -- mempool hash from denying attribution to its real sender.
    if p_block_number is null or num_nonnulls(
      existing_burn.block_number,
      existing_burn.block_hash,
      existing_burn.log_index
    ) <> 0 then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    update public.grave_burn_intents
       set status = 'failed',
           consumed_at = null
     where id = existing_burn.intent_id
       and status = 'consumed';

    if not found then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    delete from public.grave_burns
     where id = existing_burn.id;
  end if;

  insert into public.grave_burns (
    intent_id,
    grave_id,
    wallet_address,
    github_username,
    mourner_source,
    tx_hash,
    chain_id,
    token_address,
    burn_address,
    amount_raw,
    status,
    block_number,
    block_hash,
    log_index,
    submitted_at,
    verified_at,
    last_checked_at
  ) values (
    locked_intent.id,
    locked_intent.grave_id,
    locked_intent.wallet_address,
    locked_intent.github_username,
    case when locked_intent.github_username is null then 'wallet' else 'github' end,
    lower(p_tx_hash),
    locked_intent.chain_id,
    locked_intent.token_address,
    locked_intent.burn_address,
    locked_intent.amount_raw,
    p_status,
    p_block_number,
    lower(p_block_hash),
    p_log_index,
    p_checked_at,
    case when p_status = 'verified' then p_checked_at else null end,
    p_checked_at
  );

  update public.grave_burn_intents
     set status = 'consumed',
         consumed_at = p_checked_at
   where id = p_intent_id;

  return jsonb_build_object('outcome', 'bound', 'burn_status', p_status);
exception
  when unique_violation then
    return jsonb_build_object('outcome', 'conflict');
end;
$$;

revoke all on function public.expire_grave_burn_intent(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.expire_grave_burn_intent(
  uuid, uuid, timestamptz
) to service_role;

revoke all on function public.bind_grave_burn(
  uuid, uuid, text, text, numeric, text, integer, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.bind_grave_burn(
  uuid, uuid, text, text, numeric, text, integer, timestamptz, timestamptz
) to service_role;

commit;
