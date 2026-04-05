create table if not exists public.cli_tokens (
  id uuid primary key,
  github_username text not null references public.users(github_username) on update cascade on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists cli_tokens_github_username_idx
  on public.cli_tokens (github_username)
  where revoked_at is null;

create table if not exists public.cli_link_sessions (
  id uuid primary key,
  github_username text references public.users(github_username) on update cascade on delete cascade,
  token_id uuid references public.cli_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  claimed_at timestamptz
);

create index if not exists cli_link_sessions_expires_at_idx
  on public.cli_link_sessions (expires_at);
