create table if not exists public.agent_ash_tokens (
  id text primary key,
  token_hash text not null unique,
  token_prefix text not null,
  agent_name text not null,
  agent_did text,
  gitlawb_node_url text not null,
  public_key text,
  scopes text[] not null default array['agent_ashes:write'],
  created_by_user_id text not null references public.users(github_username) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.agent_ash_tokens enable row level security;

create index if not exists agent_ash_tokens_created_by_user_id_idx
  on public.agent_ash_tokens (created_by_user_id)
  where revoked_at is null;

create table if not exists public.agent_ash_link_sessions (
  id text primary key,
  claim_token_hash text not null,
  agent_name text not null,
  agent_did text,
  gitlawb_node_url text not null,
  public_key text,
  scopes text[] not null default array['agent_ashes:write'],
  created_by_user_id text references public.users(github_username) on update cascade on delete cascade,
  token_id text references public.agent_ash_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  denied_at timestamptz,
  claimed_at timestamptz
);

alter table public.agent_ash_link_sessions enable row level security;

create index if not exists agent_ash_link_sessions_expires_at_idx
  on public.agent_ash_link_sessions (expires_at);

alter table public.agent_ashes
  add column if not exists agent_ash_token_id text references public.agent_ash_tokens(id) on delete set null,
  add column if not exists authorized_agent_name text,
  add column if not exists authorized_agent_did text,
  add column if not exists authorized_by_user_id text references public.users(github_username) on update cascade on delete set null;

create index if not exists agent_ashes_agent_ash_token_id_idx
  on public.agent_ashes (agent_ash_token_id);

create index if not exists agent_ashes_authorized_by_user_id_idx
  on public.agent_ashes (authorized_by_user_id);
