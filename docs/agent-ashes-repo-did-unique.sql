-- Enforce one Agent Ash record per GitLawb repo DID.
-- Run the duplicate query first; resolve any returned rows before creating the unique index.
-- CREATE INDEX CONCURRENTLY must run outside an explicit transaction.

select
  repo_did,
  count(*) as duplicate_count,
  array_agg(id order by created_at asc) as record_ids
from public.agent_ashes
where repo_did is not null
group by repo_did
having count(*) > 1;

create unique index concurrently if not exists agent_ashes_repo_did_unique_idx
  on public.agent_ashes (repo_did)
  where repo_did is not null;

drop index concurrently if exists public.agent_ashes_repo_death_unique_idx;
