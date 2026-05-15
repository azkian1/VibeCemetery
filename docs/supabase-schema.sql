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
