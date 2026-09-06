create extension if not exists pgcrypto;

create table if not exists public.users (
  github_id bigint primary key,
  github_username text not null unique,
  avatar_url text,
  graves_count integer not null default 0,
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
  github_url text,
  github_repo_id bigint unique,
  author_github text,
  slot_id integer not null,
  map_version text not null default 'v1' check (map_version in ('v1','v2')),
  grave_gid integer,
  constraint graves_slot_id_map_version_key unique(slot_id,map_version),
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


-- Apply after map-v2-grave-gid.sql. All calls go through the service role.
begin;
-- Early production installs predate this column used by atomic counter updates.
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.graves alter column github_url drop not null;
alter table public.graves alter column github_repo_id drop not null;
alter table public.graves add column if not exists source text not null default 'github';
alter table public.graves add column if not exists project_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'graves_source_identity_check' and conrelid = 'public.graves'::regclass) then
    alter table public.graves add constraint graves_source_identity_check check (
      (source = 'github' and github_repo_id is not null and github_repo_id > 0 and github_url is not null)
      or (source = 'local' and github_repo_id is null and github_url is null and project_key is not null and project_key ~ '^sha256:[a-f0-9]{64}$')
    );
  end if;
end $$;
create unique index if not exists graves_author_project_key_unique on public.graves(lower(author_github), project_key) where project_key is not null;

create or replace function public.create_grave_once(
  p_author_github text, p_grave jsonb, p_auto_slot_ids integer[], p_slot_id integer,
  p_map_version text, p_grave_gid integer default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_author text := lower(trim(p_author_github));
  v_source text := p_grave->>'source';
  v_key text := p_grave->>'project_key';
  v_repo bigint := (p_grave->>'github_repo_id')::bigint;
  v_grave public.graves%rowtype;
  v_slots integer;
  v_limit integer;
  v_constraint text;
begin
  if v_author is null or v_author = '' or p_map_version is null or p_map_version not in ('v1','v2') then
    return jsonb_build_object('status','failed');
  end if;
  perform pg_advisory_xact_lock(hashtext('grave-account:' || v_author));
  select 4 + case when x_first_grave_shared_at is not null then 1 else 0 end into v_limit
    from public.users where lower(github_username) = v_author for update;
  if v_limit is null then return jsonb_build_object('status','failed'); end if;
  if v_source = 'local' then
    if v_key is null or v_key !~ '^sha256:[a-f0-9]{64}$' or v_repo is not null or p_grave->>'github_url' is not null then
      return jsonb_build_object('status','failed');
    end if;
    select * into v_grave from public.graves where lower(author_github) = v_author and project_key = v_key;
    if found then return jsonb_build_object('status','replayed','grave',to_jsonb(v_grave) - 'project_key'); end if;
  elsif v_source = 'github' then
    if v_repo is null or v_repo <= 0 or p_grave->>'github_url' is null then return jsonb_build_object('status','failed'); end if;
    if exists(select 1 from public.graves where github_repo_id = v_repo) then return jsonb_build_object('status','duplicate_repo'); end if;
  else return jsonb_build_object('status','failed');
  end if;
  select count(*)::integer into v_slots from public.graves where lower(author_github) = v_author;
  if v_slots >= v_limit then
    return jsonb_build_object('status','user_slots_exhausted','slots_unlocked',v_limit,'slots_used',v_slots);
  end if;
  if p_slot_id is null or p_slot_id = 0 then return jsonb_build_object('status','no_slots'); end if;
  if p_auto_slot_ids is null or not coalesce(p_slot_id = any(p_auto_slot_ids), false) then return jsonb_build_object('status','failed'); end if;
  begin
    insert into public.graves(name,description,epitaph,born_at,died_at,cause,stack,github_url,github_repo_id,
      author_github,slot_id,last_commit_message,map_version,grave_gid,source,project_key)
    values(p_grave->>'name',p_grave->>'description',p_grave->>'epitaph',(p_grave->>'born_at')::timestamptz,
      (p_grave->>'died_at')::timestamptz,p_grave->>'cause',
      case when jsonb_typeof(p_grave->'stack') = 'array' then array(select jsonb_array_elements_text(p_grave->'stack')) else null end,
      p_grave->>'github_url',v_repo,v_author,p_slot_id,p_grave->>'last_commit_message',p_map_version,p_grave_gid,v_source,v_key)
    returning * into v_grave;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'graves_github_repo_id_key' then return jsonb_build_object('status','duplicate_repo'); end if;
    if v_constraint in ('graves_slot_id_key','graves_slot_id_map_version_key') then return jsonb_build_object('status','slot_collision'); end if;
    raise;
  end;
  update public.users set graves_count = v_slots + 1, updated_at = now() where lower(github_username) = v_author;
  return jsonb_build_object('status','created','grave',to_jsonb(v_grave) - 'project_key');
end $$;
revoke all on function public.create_grave_once(text,jsonb,integer[],integer,text,integer) from public,anon,authenticated;
grant execute on function public.create_grave_once(text,jsonb,integer[],integer,text,integer) to service_role;
commit;

-- Apply after web3-grave-burn-mvp.sql. All amounts leave SQL as decimal strings.
create or replace function public.get_offering_ledger() returns jsonb
language sql stable set search_path = public, pg_temp as $$
with verified as (
  select b.*, g.name as grave_name, lower(g.author_github) as grave_author
  from public.grave_burns b join public.graves g on g.id = b.grave_id where b.status = 'verified'
), received as (
  select grave_id, sum(amount_raw) as amount from verified group by grave_id
), authors as (
  select coalesce(lower(g.author_github),'anonymous') as author, count(*) as buried, coalesce(sum(r.amount),0) as offerings
  from public.graves g left join received r on r.grave_id = g.id group by coalesce(lower(g.author_github),'anonymous')
), causes as (
  select coalesce(cause,'Unknown') as cause, count(*) as count from public.graves group by coalesce(cause,'Unknown')
), recent as (select * from verified order by verified_at desc nulls last, id desc limit 50)
select jsonb_build_object(
  'totalBurnedRaw', (select coalesce(sum(amount_raw),0)::text from verified),
  'burnCount', (select count(*) from verified),
  'authors', coalesce((select jsonb_agg(jsonb_build_object('author',author,'buried',buried,'offeringsRaw',offerings::text) order by buried desc,offerings desc,author) from authors),'[]'::jsonb),
  'causes', coalesce((select jsonb_agg(jsonb_build_object('cause',cause,'count',count) order by count desc,cause) from causes),'[]'::jsonb),
  'recent', coalesce((select jsonb_agg(jsonb_build_object('id',id,'graveId',grave_id,'graveName',grave_name,'walletAddress',wallet_address,'githubUsername',github_username,'amountRaw',amount_raw::text,'txHash',tx_hash,'verifiedAt',verified_at) order by verified_at desc nulls last,id desc) from recent),'[]'::jsonb)
);
$$;
revoke all on function public.get_offering_ledger() from public,anon,authenticated;
grant execute on function public.get_offering_ledger() to service_role;
