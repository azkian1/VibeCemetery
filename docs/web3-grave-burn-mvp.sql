-- VibeCemetery Web3 grave offering MVP.
-- Idempotent migration; safe to re-run after the Map 2.0 migration.

create extension if not exists pgcrypto;

create table if not exists public.grave_burn_intents (
  id uuid primary key,
  grave_id uuid not null references public.graves(id) on delete cascade,
  wallet_address text not null,
  github_username text,
  amount_raw numeric(78, 0) not null,
  chain_id integer not null default 8453,
  token_address text not null,
  burn_address text not null,
  nonce text not null unique,
  status text not null default 'created',
  signature text,
  authorized_block_number numeric(78, 0),
  authorized_block_hash text,
  authorization_verified_at timestamptz,
  expires_at timestamptz not null,
  authorized_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint grave_burn_intents_amount_positive check (amount_raw > 0),
  constraint grave_burn_intents_chain_base check (chain_id = 8453),
  constraint grave_burn_intents_wallet_format check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint grave_burn_intents_token_fixed check (token_address = '0xb48bc4896d18724f7bf5a3d2817fc35252cd7ba3'),
  constraint grave_burn_intents_burn_fixed check (burn_address = '0x000000000000000000000000000000000000dead'),
  constraint grave_burn_intents_nonce_format check (nonce ~ '^0x[0-9a-f]{64}$'),
  constraint grave_burn_intents_status_check check (status in ('created', 'authorized', 'consumed', 'expired', 'failed')),
  constraint grave_burn_intents_signature_format check (signature is null or signature ~ '^0x[0-9a-f]+$'),
  constraint grave_burn_intents_block_hash_format check (authorized_block_hash is null or authorized_block_hash ~ '^0x[0-9a-f]{64}$')
);

create table if not exists public.grave_burns (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique references public.grave_burn_intents(id),
  grave_id uuid not null references public.graves(id) on delete cascade,
  wallet_address text not null,
  github_username text,
  mourner_source text not null,
  tx_hash text not null unique,
  chain_id integer not null default 8453,
  token_address text not null,
  burn_address text not null,
  amount_raw numeric(78, 0) not null,
  status text not null,
  block_number numeric(78, 0),
  block_hash text,
  log_index integer,
  failure_code text,
  submitted_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz,
  last_checked_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint grave_burns_amount_positive check (amount_raw > 0),
  constraint grave_burns_chain_base check (chain_id = 8453),
  constraint grave_burns_wallet_format check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint grave_burns_token_fixed check (token_address = '0xb48bc4896d18724f7bf5a3d2817fc35252cd7ba3'),
  constraint grave_burns_burn_fixed check (burn_address = '0x000000000000000000000000000000000000dead'),
  constraint grave_burns_tx_hash_format check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint grave_burns_block_hash_format check (block_hash is null or block_hash ~ '^0x[0-9a-f]{64}$'),
  constraint grave_burns_status_check check (status in ('pending', 'verified', 'failed', 'orphaned')),
  constraint grave_burns_source_check check (mourner_source in ('github', 'wallet')),
  constraint grave_burns_log_index_nonnegative check (log_index is null or log_index >= 0)
);

create index if not exists grave_burn_intents_wallet_idx
  on public.grave_burn_intents (wallet_address);
create index if not exists grave_burn_intents_grave_status_idx
  on public.grave_burn_intents (grave_id, status);
create index if not exists grave_burns_grave_status_idx
  on public.grave_burns (grave_id, status);
create index if not exists grave_burns_grave_status_wallet_idx
  on public.grave_burns (grave_id, status, wallet_address);
create index if not exists grave_burns_pending_reverify_idx
  on public.grave_burns (last_checked_at)
  where status = 'pending';
create index if not exists grave_burns_wallet_idx
  on public.grave_burns (wallet_address);

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
     and status in ('created', 'authorized')
     and expires_at <= p_checked_at;
end;
$$;

create or replace function public.authorize_grave_burn_intent(
  p_grave_id uuid,
  p_intent_id uuid,
  p_signature text,
  p_authorized_block_number numeric,
  p_authorized_block_hash text,
  p_authorization_verified_at timestamptz,
  p_github_username text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_intent public.grave_burn_intents%rowtype;
begin
  select *
    into locked_intent
    from public.grave_burn_intents
   where id = p_intent_id and grave_id = p_grave_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if locked_intent.status = 'authorized' and locked_intent.signature = lower(p_signature) then
    return jsonb_build_object('outcome', 'already_authorized');
  end if;

  if locked_intent.status <> 'created' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  if locked_intent.expires_at <= p_authorization_verified_at then
    update public.grave_burn_intents
       set status = 'expired'
     where id = p_intent_id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  update public.grave_burn_intents
     set status = 'authorized',
         signature = lower(p_signature),
         authorized_block_number = p_authorized_block_number,
         authorized_block_hash = lower(p_authorized_block_hash),
         authorization_verified_at = p_authorization_verified_at,
         authorized_at = p_authorization_verified_at,
         github_username = nullif(trim(p_github_username), '')
   where id = p_intent_id;

  return jsonb_build_object('outcome', 'authorized');
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

  select *
    into existing_burn
    from public.grave_burns
   where tx_hash = lower(p_tx_hash);

  if found then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if locked_intent.status <> 'authorized' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;

  if p_transfer_block_timestamp is null then
    -- Persist a just-broadcast tx while its receipt is temporarily unavailable.
    -- This lets the protected reverification job finish the check even if the
    -- browser closes. Unverified rows are never included in public burn stats.
    if locked_intent.expires_at <= p_checked_at then
      update public.grave_burn_intents
         set status = 'expired'
       where id = p_intent_id;
      return jsonb_build_object('outcome', 'expired');
    end if;
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

-- Remove the pre-recovery overload only after its replacement exists. The new
-- overload receives the canonical block timestamp, so a receipt discovered
-- after intent expiry is accepted only when the transfer itself was mined
-- before the deadline.
drop function if exists public.bind_grave_burn(
  uuid, uuid, text, text, numeric, text, integer, timestamptz
);

create or replace function public.reverify_grave_burn(
  p_burn_id uuid,
  p_status text,
  p_block_number numeric,
  p_block_hash text,
  p_log_index integer,
  p_failure_code text,
  p_checked_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_burn public.grave_burns%rowtype;
begin
  if p_status not in ('pending', 'verified', 'failed', 'orphaned') then
    raise exception 'invalid grave burn status';
  end if;

  select *
    into locked_burn
    from public.grave_burns
   where id = p_burn_id
   for update;

  if not found or locked_burn.status not in ('pending', 'verified') then
    return;
  end if;

  update public.grave_burns
     set status = p_status,
         block_number = coalesce(p_block_number, block_number),
         block_hash = coalesce(lower(p_block_hash), block_hash),
         log_index = coalesce(p_log_index, log_index),
         failure_code = p_failure_code,
         verified_at = case
           when p_status = 'verified' then coalesce(verified_at, p_checked_at)
           else verified_at
         end,
         last_checked_at = p_checked_at
   where id = p_burn_id;
end;
$$;

create or replace function public.get_grave_burn_stats(p_grave_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with verified as (
    select
      lower(wallet_address) as wallet_address,
      github_username,
      amount_raw,
      coalesce(verified_at, created_at) as display_timestamp
    from public.grave_burns
    where grave_id = p_grave_id
      and status = 'verified'
  ),
  totals as (
    select
      coalesce(sum(amount_raw), 0) as total_raw,
      count(*) as burn_count
    from verified
  ),
  grouped as (
    select wallet_address, sum(amount_raw) as amount_raw
    from verified
    group by wallet_address
  ),
  ranked as (
    select
      grouped.wallet_address,
      grouped.amount_raw,
      (
        select candidate.github_username
        from verified candidate
        where candidate.wallet_address = grouped.wallet_address
          and candidate.github_username is not null
        order by candidate.display_timestamp desc, candidate.github_username asc
        limit 1
      ) as github_username
    from grouped
  ),
  top_rows as (
    select *
    from ranked
    order by amount_raw desc, wallet_address asc
    limit 3
  )
  select jsonb_build_object(
    'totalBurnedRaw', totals.total_raw::text,
    'burnCount', totals.burn_count,
    'topMourners', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'walletAddress', top_rows.wallet_address,
          'githubUsername', top_rows.github_username,
          'amountRaw', top_rows.amount_raw::text
        )
        order by top_rows.amount_raw desc, top_rows.wallet_address asc
      )
      from top_rows
    ), '[]'::jsonb)
  )
  from totals;
$$;

alter table public.grave_burn_intents enable row level security;
alter table public.grave_burn_intents force row level security;
revoke all on table public.grave_burn_intents from anon, authenticated;

alter table public.grave_burns enable row level security;
alter table public.grave_burns force row level security;
revoke all on table public.grave_burns from anon, authenticated;

revoke all on function public.authorize_grave_burn_intent(uuid, uuid, text, numeric, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.expire_grave_burn_intent(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.bind_grave_burn(uuid, uuid, text, text, numeric, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reverify_grave_burn(uuid, text, numeric, text, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_grave_burn_stats(uuid)
  from public, anon, authenticated;

grant execute on function public.authorize_grave_burn_intent(uuid, uuid, text, numeric, text, timestamptz, text)
  to service_role;
grant execute on function public.expire_grave_burn_intent(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.bind_grave_burn(uuid, uuid, text, text, numeric, text, integer, timestamptz, timestamptz)
  to service_role;
grant execute on function public.reverify_grave_burn(uuid, text, numeric, text, integer, text, timestamptz)
  to service_role;
grant execute on function public.get_grave_burn_stats(uuid)
  to service_role;
