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
