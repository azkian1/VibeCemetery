create extension if not exists pgcrypto;

create table if not exists public.users (
  github_id bigint primary key,
  github_username text not null unique,
  avatar_url text,
  graves_count integer not null default 0,
  cremated_count integer not null default 0,
  x_first_grave_shared_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.users
  add column if not exists x_first_grave_shared_at timestamptz;

create table if not exists public.graves (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  born_at timestamptz,
  died_at timestamptz,
  cause text not null,
  epitaph text,
  description text,
  stack text[],
  github_url text not null,
  github_repo_id bigint not null unique,
  author_github text,
  slot_id integer not null unique,
  tier integer not null default 0,
  f_count integer not null default 0,
  last_commit_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists graves_author_github_idx on public.graves (author_github);
create index if not exists graves_created_at_idx on public.graves (created_at desc);

create table if not exists public.f_votes (
  id bigint generated always as identity primary key,
  grave_id uuid not null references public.graves(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (grave_id, username)
);

create index if not exists f_votes_username_idx on public.f_votes (username);

create table if not exists public.cremated (
  id bigint generated always as identity primary key,
  name text not null,
  cause text not null,
  author_github text not null,
  github_url text,
  last_commit_message text,
  source text not null default 'github',
  created_at timestamptz not null default timezone('utc', now()),
  constraint cremated_source_check check (source in ('github', 'skill'))
);

create index if not exists cremated_author_github_idx on public.cremated (author_github);
create index if not exists cremated_created_at_idx on public.cremated (created_at desc);

create table if not exists public.agent_ashes (
  id uuid primary key default gen_random_uuid(),
  certificate_hash varchar(128) unique not null,
  schema_version varchar(50) not null,
  source varchar(50) not null default 'gitlawb',
  repo_did varchar(255),
  agent_did varchar(255),
  agent_name varchar(100),
  subject_name varchar(255) not null,
  subject_path varchar(500),
  subject_url text,
  primary_cause varchar(80) not null,
  failure_pattern varchar(150),
  death_stage varchar(80),
  confidence numeric(4, 3),
  created_at_source timestamptz,
  last_activity_at timestamptz,
  declared_dead_at timestamptz,
  verification_status varchar(50) not null default 'pending',
  verification_url text,
  certificate jsonb not null,
  proof jsonb,
  human_approved boolean,
  human_response text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_ashes_repo_did_idx on public.agent_ashes (repo_did);
create index if not exists agent_ashes_agent_did_idx on public.agent_ashes (agent_did);
create index if not exists agent_ashes_primary_cause_idx on public.agent_ashes (primary_cause);
create index if not exists agent_ashes_verification_status_idx on public.agent_ashes (verification_status);
create unique index if not exists agent_ashes_repo_did_unique_idx on public.agent_ashes (repo_did) where repo_did is not null;
drop index if exists agent_ashes_repo_death_unique_idx;

create table if not exists public.cli_tokens (
  id uuid primary key,
  github_username text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists cli_tokens_github_username_idx on public.cli_tokens (github_username);

create table if not exists public.cli_link_sessions (
  id uuid primary key,
  github_username text,
  token_id uuid references public.cli_tokens(id) on delete set null,
  claim_token_hash text not null,
  approved_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cli_link_sessions_expires_at_idx on public.cli_link_sessions (expires_at);

create or replace function public.increment_graves_count(username text)
returns void
language sql
as $$
  update public.users
  set graves_count = graves_count + 1,
      updated_at = timezone('utc', now())
  where github_username = username;
$$;

create or replace function public.increment_cremated_count(username text)
returns void
language sql
as $$
  update public.users
  set cremated_count = cremated_count + 1,
      updated_at = timezone('utc', now())
  where github_username = username;
$$;

-- The application accesses all public tables through server-side API routes
-- using SUPABASE_SERVICE_KEY. Keep the Supabase Data API closed to browser
-- anon/authenticated roles even if a future client exposes the public key.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

ALTER TABLE public.graves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graves FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.graves FROM anon, authenticated;

ALTER TABLE public.f_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f_votes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.f_votes FROM anon, authenticated;

ALTER TABLE public.cremated ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cremated FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cremated FROM anon, authenticated;

ALTER TABLE public.cli_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cli_tokens FROM anon, authenticated;

ALTER TABLE public.cli_link_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_link_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cli_link_sessions FROM anon, authenticated;

ALTER TABLE public.agent_ashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_ashes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_ashes FROM anon, authenticated;

-- Web3 grave offerings. Keep these definitions in sync with the independently
-- runnable docs/web3-grave-burn-mvp.sql migration.
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

create index if not exists grave_burn_intents_wallet_idx on public.grave_burn_intents (wallet_address);
create index if not exists grave_burn_intents_grave_status_idx on public.grave_burn_intents (grave_id, status);
create index if not exists grave_burns_grave_status_idx on public.grave_burns (grave_id, status);
create index if not exists grave_burns_grave_status_wallet_idx on public.grave_burns (grave_id, status, wallet_address);
create index if not exists grave_burns_pending_reverify_idx on public.grave_burns (last_checked_at) where status = 'pending';
create index if not exists grave_burns_wallet_idx on public.grave_burns (wallet_address);

create or replace function public.expire_grave_burn_intent(
  p_grave_id uuid, p_intent_id uuid, p_checked_at timestamptz
)
returns void language plpgsql security definer
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
  p_grave_id uuid, p_intent_id uuid, p_signature text,
  p_authorized_block_number numeric, p_authorized_block_hash text,
  p_authorization_verified_at timestamptz, p_github_username text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare locked_intent public.grave_burn_intents%rowtype;
begin
  select * into locked_intent from public.grave_burn_intents
   where id = p_intent_id and grave_id = p_grave_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if locked_intent.status = 'authorized' and locked_intent.signature = lower(p_signature) then
    return jsonb_build_object('outcome', 'already_authorized');
  end if;
  if locked_intent.status <> 'created' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;
  if locked_intent.expires_at <= p_authorization_verified_at then
    update public.grave_burn_intents set status = 'expired' where id = p_intent_id;
    return jsonb_build_object('outcome', 'expired');
  end if;
  update public.grave_burn_intents
     set status = 'authorized', signature = lower(p_signature),
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
  p_grave_id uuid, p_intent_id uuid, p_tx_hash text, p_status text,
  p_block_number numeric, p_block_hash text, p_log_index integer,
  p_checked_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  locked_intent public.grave_burn_intents%rowtype;
  existing_burn public.grave_burns%rowtype;
begin
  if p_status not in ('pending', 'verified') then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(p_tx_hash), 0));
  select * into locked_intent from public.grave_burn_intents
   where id = p_intent_id and grave_id = p_grave_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  select * into existing_burn from public.grave_burns where intent_id = p_intent_id;
  if found then
    if existing_burn.tx_hash = lower(p_tx_hash) then
      return jsonb_build_object('outcome', 'existing', 'burn_status', existing_burn.status);
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;
  select * into existing_burn from public.grave_burns where tx_hash = lower(p_tx_hash);
  if found then return jsonb_build_object('outcome', 'conflict'); end if;
  if locked_intent.status <> 'authorized' then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;
  if locked_intent.expires_at <= p_checked_at then
    update public.grave_burn_intents set status = 'expired' where id = p_intent_id;
    return jsonb_build_object('outcome', 'expired');
  end if;
  insert into public.grave_burns (
    intent_id, grave_id, wallet_address, github_username, mourner_source,
    tx_hash, chain_id, token_address, burn_address, amount_raw, status,
    block_number, block_hash, log_index, submitted_at, verified_at, last_checked_at
  ) values (
    locked_intent.id, locked_intent.grave_id, locked_intent.wallet_address,
    locked_intent.github_username,
    case when locked_intent.github_username is null then 'wallet' else 'github' end,
    lower(p_tx_hash), locked_intent.chain_id, locked_intent.token_address,
    locked_intent.burn_address, locked_intent.amount_raw, p_status,
    p_block_number, lower(p_block_hash), p_log_index, p_checked_at,
    case when p_status = 'verified' then p_checked_at else null end, p_checked_at
  );
  update public.grave_burn_intents
     set status = 'consumed', consumed_at = p_checked_at
   where id = p_intent_id;
  return jsonb_build_object('outcome', 'bound', 'burn_status', p_status);
exception when unique_violation then
  return jsonb_build_object('outcome', 'conflict');
end;
$$;

create or replace function public.reverify_grave_burn(
  p_burn_id uuid, p_status text, p_block_number numeric, p_block_hash text,
  p_log_index integer, p_failure_code text, p_checked_at timestamptz
)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare locked_burn public.grave_burns%rowtype;
begin
  if p_status not in ('pending', 'verified', 'failed', 'orphaned') then
    raise exception 'invalid grave burn status';
  end if;
  select * into locked_burn from public.grave_burns where id = p_burn_id for update;
  if not found or locked_burn.status not in ('pending', 'verified') then return; end if;
  update public.grave_burns
     set status = p_status,
         block_number = coalesce(p_block_number, block_number),
         block_hash = coalesce(lower(p_block_hash), block_hash),
         log_index = coalesce(p_log_index, log_index),
         failure_code = p_failure_code,
         verified_at = case when p_status = 'verified'
           then coalesce(verified_at, p_checked_at) else verified_at end,
         last_checked_at = p_checked_at
   where id = p_burn_id;
end;
$$;

create or replace function public.get_grave_burn_stats(p_grave_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  with verified as (
    select lower(wallet_address) as wallet_address, github_username, amount_raw,
           coalesce(verified_at, created_at) as display_timestamp
    from public.grave_burns
    where grave_id = p_grave_id and status = 'verified'
  ),
  totals as (
    select coalesce(sum(amount_raw), 0) as total_raw, count(*) as burn_count
    from verified
  ),
  grouped as (
    select wallet_address, sum(amount_raw) as amount_raw
    from verified group by wallet_address
  ),
  ranked as (
    select grouped.wallet_address, grouped.amount_raw, (
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
    select * from ranked order by amount_raw desc, wallet_address asc limit 3
  )
  select jsonb_build_object(
    'totalBurnedRaw', totals.total_raw::text,
    'burnCount', totals.burn_count,
    'topMourners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'walletAddress', top_rows.wallet_address,
        'githubUsername', top_rows.github_username,
        'amountRaw', top_rows.amount_raw::text
      ) order by top_rows.amount_raw desc, top_rows.wallet_address asc)
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
revoke all on function public.bind_grave_burn(uuid, uuid, text, text, numeric, text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reverify_grave_burn(uuid, text, numeric, text, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_grave_burn_stats(uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_grave_burn_intent(uuid, uuid, text, numeric, text, timestamptz, text)
  to service_role;
grant execute on function public.expire_grave_burn_intent(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.bind_grave_burn(uuid, uuid, text, text, numeric, text, integer, timestamptz)
  to service_role;
grant execute on function public.reverify_grave_burn(uuid, text, numeric, text, integer, text, timestamptz)
  to service_role;
grant execute on function public.get_grave_burn_stats(uuid)
  to service_role;

-- Atomic cremation writes (keep in sync with cremation-write-v2.sql).
-- Apply BEFORE deploying the matching API. Safe to reapply; preserves legacy rows.
begin;

alter table public.cremated add column if not exists project_key text;
alter table public.cremated add column if not exists github_repo_id bigint;

create unique index if not exists cremated_author_project_key_idx
  on public.cremated (lower(author_github), project_key) where project_key is not null;
create unique index if not exists cremated_author_repo_id_idx
  on public.cremated (lower(author_github), github_repo_id) where github_repo_id is not null;
create index if not exists cremated_author_day_idx
  on public.cremated (lower(author_github), created_at);

-- Only the server may call this function, after authentication and (when linked)
-- GitHub validation. A client-supplied project key is identity, not proof of code.
create or replace function public.create_cremation_once(
  p_author_github text,
  p_name text,
  p_cause text,
  p_source text,
  p_project_key text,
  p_github_url text,
  p_github_repo_id bigint,
  p_last_commit_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_author text := lower(p_author_github);
  v_url text := lower(rtrim(p_github_url, '/'));
  v_record public.cremated%rowtype;
  v_total bigint;
  v_daily bigint;
  v_now timestamptz;
  v_day timestamptz;
begin
  if v_author is null or v_author !~ '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$'
    or p_name is null or length(btrim(p_name)) not between 1 and 100
    or p_cause is null or length(btrim(p_cause)) not between 1 and 200
    or p_source is null or p_source not in ('github', 'skill')
    or (p_project_key is not null and p_project_key !~ '^sha256:[a-f0-9]{64}$')
    or (p_project_key is null and p_github_repo_id is null)
    or (p_github_repo_id is not null and p_github_repo_id <= 0)
    or (p_github_url is not null and p_github_repo_id is null)
    or (p_source = 'github' and (p_github_repo_id is null or p_github_url is null)) then
    raise exception 'Invalid cremation input' using errcode = '22023';
  end if;

  -- Serializes duplicate lookup, quotas, insert and counter for this account.
  perform pg_advisory_xact_lock(hashtext('cremation-v2'), hashtext(v_author));
  v_now := clock_timestamp();
  v_day := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';

  select * into v_record from public.cremated
  where lower(author_github) = v_author and (
    (p_project_key is not null and project_key = p_project_key)
    or (p_github_repo_id is not null and github_repo_id = p_github_repo_id)
    -- Covers records written before project_key / github_repo_id existed.
    or (v_url is not null and lower(rtrim(github_url, '/')) = v_url)
  ) order by id limit 1;

  if found then
    -- Remember the verified numeric identity for legacy rows so a later rename
    -- still resolves to this cremation. Never rewrite its public content.
    if v_record.github_repo_id is null and p_github_repo_id is not null
      and lower(rtrim(v_record.github_url, '/')) = v_url
      and not exists (select 1 from public.cremated
        where lower(author_github) = v_author and github_repo_id = p_github_repo_id) then
      update public.cremated set github_repo_id = p_github_repo_id
        where id = v_record.id returning * into v_record;
    end if;
    return jsonb_build_object('status', 'existing',
      'record', to_jsonb(v_record) - 'project_key' - 'github_repo_id');
  end if;

  select count(*), count(*) filter (where created_at >= v_day)
    into v_total, v_daily from public.cremated where lower(author_github) = v_author;
  -- Preserve the existing product allowance: first 50 total, then 3 per UTC day.
  if v_total >= 50 and v_daily >= 3 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::integer));
  end if;

  insert into public.cremated (
    name, cause, author_github, source, project_key, github_url, github_repo_id,
    last_commit_message, created_at
  ) values (
    p_name, p_cause, v_author, p_source, p_project_key, p_github_url, p_github_repo_id,
    p_last_commit_message, v_now
  ) returning * into v_record;

  update public.users set cremated_count = v_total + 1
    where lower(github_username) = v_author;

  return jsonb_build_object('status', 'created',
    'record', to_jsonb(v_record) - 'project_key' - 'github_repo_id');
end;
$$;

revoke all on function public.create_cremation_once(text, text, text, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.create_cremation_once(text, text, text, text, text, text, bigint, text)
  to service_role;

commit;
