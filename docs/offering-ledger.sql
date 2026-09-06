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
