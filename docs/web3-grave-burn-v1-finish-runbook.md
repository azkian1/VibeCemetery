# GRAVE Burn v1 — pre-release и Preview runbook

Этот runbook завершает только burn-механику Cemetery Map v1. Он не разрешает
`git push`, Vercel deployment, изменение environment variables, применение SQL
или Base Mainnet транзакцию без отдельного решения владельца.

## 1. Что является релизной единицей

Для v1 не нужен новый Solidity-контракт. Релиз состоит из четырёх частей:

1. точный Git commit приложения;
2. focused Supabase migration `docs/web3-grave-burn-v1-finish.sql`;
3. Preview environment и новый immutable Vercel deployment;
4. защищённый ручной reverify/cleanup и acceptance.

Supabase используется совместно Preview и Production. Поэтому применение
migration является изменением Production database schema даже при выключенных
Production-флагах. Оно требует отдельного подтверждения владельца.

## 2. Локальные release gates

До commit должны пройти:

- профильные burn/security tests;
- fake-wallet browser E2E;
- TypeScript `--noEmit`;
- полный ESLint;
- production build с inert build env;
- `git diff --check`;
- ручной review полного diff и списка новых файлов.

Exact release SHA получить через `git rev-parse HEAD` после завершения всех
локальных изменений и записать во внешний deployment record. Не использовать
название ветки или промежуточный commit вместо точного release SHA. Live
preflight и deployment evidence хранить вне отслеживаемых файлов репозитория.

Stop condition: любой открытый `P0`/`P1`, красный gate или необъяснённый файл.

## 3. Environment matrix

Значения secrets не копировать в отчёты или терминал.

| Variable | Preview: закрытый smoke | Preview: UI acceptance | Production |
| --- | --- | --- | --- |
| `WEB3_GRAVE_BURNS_ENABLED` | `true` | `true` | `false` |
| `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED` | `false` | `true` | `false` |
| `BASE_RPC_URL` | задан, server-only | тот же | не менять |
| `GRAVE_BURN_REVERIFY_SECRET` | задан, server-only | тот же | не менять |
| `CRON_SECRET` | совпадает с reverify secret | тот же | не менять |

Изменение Vercel env не меняет существующий deployment. После каждого
изменения флагов нужен новый Preview deployment точного SHA и проверка, что
branch alias указывает именно на него. Production deployment, alias и env не
трогать.

## 4. Supabase read-only preflight

Выполнить в SQL Editor до migration и сохранить результаты без secrets:

```sql
select status, count(*)
from public.grave_burn_intents
group by status
order by status;

select status, count(*), coalesce(sum(amount_raw), 0) as amount_raw
from public.grave_burns
group by status
order by status;

select
  count(*) filter (where amount_raw >
    115792089237316195423570985008687907853269984665640564039457584007913129639935
  ) as intent_over_uint256
from public.grave_burn_intents;

select
  count(*) filter (where amount_raw >
    115792089237316195423570985008687907853269984665640564039457584007913129639935
  ) as burn_over_uint256
from public.grave_burns;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'grave_burn_intents_created_expiry_idx';

select c.conname, c.convalidated, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in (
  'public.grave_burn_intents'::regclass,
  'public.grave_burns'::regclass
)
and c.conname in (
  'grave_burn_intents_amount_uint256',
  'grave_burns_amount_uint256'
)
order by c.conname;

select p.oid::regprocedure as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('expire_grave_burn_intent', 'bind_grave_burn')
order by signature::text;

select p.oid::regprocedure as bind_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'bind_grave_burn';

select pid, usename, state, wait_event_type, wait_event,
       now() - xact_start as transaction_age,
       left(query, 160) as query_excerpt
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and xact_start is not null
order by xact_start;
```

Дополнительно сохранить verified baseline воспроизводимым запросом:

```sql
select
  count(*) as verified_count,
  coalesce(sum(amount_raw), 0)::text as verified_total_raw,
  md5(coalesce(string_agg(
    lower(tx_hash) || ':' || grave_id::text || ':' || amount_raw::text,
    ',' order by lower(tx_hash)
  ), '')) as verified_fingerprint
from public.grave_burns
where status = 'verified';
```

Точный порядок и набор полей fingerprint менять между preflight и postflight
нельзя.

Stop conditions:

- есть amount выше `uint256`;
- есть `authorized` или `pending`, пока не разобран каждый такой row;
- существующий index/constraint с ожидаемым именем имеет другую definition;
- неизвестна текущая function owner/ACL либо не сохранены определения функций;
- присутствует старый overload `bind_grave_burn` с восемью аргументами;
- есть длительная транзакция/lock, способные помешать DDL;
- фактическая схема не соответствует base MVP migration.

### 4.1. Quiescence и финальный baseline

Preview и Production используют общую Supabase. До shared SQL change нужно с
отдельным подтверждением владельца:

1. выставить оба Preview burn-флага в `false`;
2. создать новый immutable Preview deployment точного release SHA и убедиться,
   что branch alias указывает на него;
3. подтвердить через environment configuration и code boundary, что UI и
   server handlers gated false-флагами до database path;
4. непосредственно перед SQL повторить status counts, overflow, verified
   count/total/fingerprint, long transactions и waiting locks.

Ответ Vercel Deployment Protection до приложения не считается API postflight.
Если доступен authenticated smoke, разрешён только заведомо non-writing
malformed request.

До Run сохранить вне browser tab и отслеживаемых файлов репозитория читаемый
timestamped rollback SQL с обеими исходными function definitions и ACL. Любое
изменение baseline, отсутствующий rollback-файл, Preview-флаг в `true` или
enabled deployment — stop condition.

## 5. Focused migration

Только после quiescence, повторного baseline и отдельного подтверждения
владельца выполнить
`docs/web3-grave-burn-v1-finish.sql`. Полный `web3-grave-burn-mvp.sql` повторно
не применять.

Migration выполняется одной транзакцией, имеет `lock_timeout = 5s` и
`statement_timeout = 60s`, добавляет/валидирует `uint256` constraints, сохраняет
created-only expiry index, заменяет две функции и закрывает их от
`PUBLIC`/`anon`/`authenticated`, оставляя execute только `service_role`.

Любая ошибка должна откатить транзакцию. Не обходить timeout и не продолжать
при частично понятом результате.

## 6. Supabase postflight

Повторить все запросы раздела 4 и подтвердить:

- оба constraints присутствуют и `convalidated = true`;
- index расположен на `expires_at` и имеет predicate только
  `status = 'created'`;
- `expire_grave_burn_intent` изменяет только `created`;
- `bind_grave_burn` разрешает сохранить pending hash без receipt, но проверяет
  canonical block timestamp перед verified;
- полностью проверенный receipt может вытеснить только конфликтующий
  artifact-less recovery claim; существующий claim с block artifact остаётся
  conflict;
- ACL не даёт execute `PUBLIC`, `anon`, `authenticated`, но даёт `service_role`;
- verified count, сумма и fingerprint не изменились;
- новые burn/intents migration не создала.

Stop condition: любое расхождение baseline или ожидаемой definition.

## 7. Закрытый Preview smoke

1. Создать Preview deployment точного проверенного SHA с server flag `true`, а
   public UI flag `false`.
2. Дождаться `Ready`, проверить build logs и exact source SHA.
3. Убедиться, что Production deployment/alias/env не изменены.
4. Проверить `/cemetery`: burn UI скрыт.
5. Выполнить только безопасные GET/read-only проверки API и статистики.
6. Проверить только гарантированно pre-write отказ: отправить malformed UUID или
   structurally invalid body и ожидать `400`; до/после подтвердить неизменность
   counts. Не использовать valid grave/wallet/amount: create-intent предшествует
   подписи и создаёт `created` row в общей Supabase.

Preview cron нельзя считать автоматически проверенным: Vercel Cron обычно
привязан к Production deployment. Защищённый reverify для Preview запускать
отдельным контролируемым запросом только после сверки endpoint и bearer secret.

## 8. Preview UI acceptance без транзакции

1. Установить public Preview flag `true` и создать новый deployment того же SHA.
2. На реальной v1-могиле проверить collapsed `BURN $GRAVE`, verified total и
   disclosure `BURN`.
3. После раскрытия проверить `1,000`, `5,000`, `MAX`, custom amount, полный dead
   address и предупреждение о необратимости.
4. Проверить disconnected wallet, wrong network, zero balance, fractional
   balance и responsive layout.
5. Не нажимать финальный `BURN $GRAVE`: до wallet confirmation приложение уже
   создаёт, подписывает и авторизует intent в общей Supabase. Проверка отказа в
   wallet является отдельным write-smoke и требует явного одобрения, учёта
   созданного `authorized` row и плана его безопасного завершения.

Реальный canary transfer — отдельное необязательное действие и требует нового
явного подтверждения владельца суммы, могилы и wallet.

## 9. Cleanup/reverify acceptance

Перед запуском повторно снять status counts. Затем один раз вызвать защищённый
reverify endpoint и подтвердить:

- только фактически просроченные `created` стали `expired`;
- `authorized` не были очищены;
- pending rows либо верифицированы по canonical receipt, либо остались
  recoverable;
- verified baseline count, amount и tx hashes сохранились.

Число ожидаемых stale rows нельзя жёстко считать равным историческим трём без
нового read-only preflight.

## 10. Rollback

### Application/UI

1. Выставить оба Preview-флага в `false`.
2. Создать новый Preview deployment и дождаться `Ready`.
3. Переключить branch alias на проверенный disabled deployment.
4. Проверить, что API возвращает disabled, а UI скрыт.

Одного изменения env недостаточно: уже собранный deployment неизменяем.

### Database

Если проблема в новых function definitions, остановить Preview и восстановить
сохранённые preflight definitions и ACL отдельной одобренной транзакцией.
Constraints/index не удалять автоматически: сначала определить причину и
подтвердить отсутствие зависимостей. Verified rows не редактировать и не
удалять.

Production application остаётся выключенным, но database rollback всё равно
является Production change и требует отдельного подтверждения владельца.
