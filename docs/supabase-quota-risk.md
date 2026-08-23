# Supabase quota / billing risk

**Статус:** активный операционный блокер; решаем до canary burn и любого
Production-включения.

**Зафиксировано:** 2026-08-22.

**Проект:** `vibecemetery`, production branch `main`, project ref
`lnyfogihvackjwhdvgzo`.

## Что обнаружено

Supabase Dashboard показывает баннер `Grace period is over` и предупреждает,
что проекты организации могут перестать обслуживать запросы после исчерпания
квоты.

Это операционный риск тарифа/лимитов, а не найденная ошибка схемы или burn-кода.

## Текущее состояние

- production Supabase отвечает на SQL-запросы;
- Vercel Preview получает `200` от `/api/graves` и `/api/cremated`;
- все 9 исходных graves сохранены;
- `grave_burn_intents = 0` и `grave_burns = 0`;
- burn migration, forced RLS и server-only RPC остаются активны;
- признаков текущего простоя базы не обнаружено.

## Возможное влияние

Если квота будет исчерпана и Supabase ограничит обслуживание проекта:

- карта может перестать загружать graves;
- создание и обновление burn intents завершится ошибкой;
- подтверждённый on-chain перевод может временно остаться без записи/статуса в
  приложении до восстановления Supabase и повторной проверки;
- статистика burn и Top Mourners станет недоступна или устареет;
- reverify cron не сможет завершить pending intents.

On-chain перевод при этом не откатывается, поэтому публичный burn нельзя
включать, пока риск не закрыт.

## Текущая защита

- Production: `WEB3_GRAVE_BURNS_ENABLED=false`;
- Production: `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=false`;
- защищённый Vercel Preview: `WEB3_GRAVE_BURNS_ENABLED=true` и
  `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=true`;
- Preview закрыт Vercel Authentication и не является публичной активацией;
- реальные burn-транзакции не проводятся;
- публичный Base RPC используется только временно в Preview.

Preview UI уже может показать `Connect Wallet` и `Burn Offering` в модалке
реальной могилы v1. Это не снимает блокировку canary: подтверждать перевод
нельзя до закрытия quota/billing risk, замены RPC и отдельного разрешения
владельца непосредственно перед транзакцией.

## Что проверить позже

1. Открыть organization `Billing` и `Usage` в Supabase.
2. Уточнить текущий тариф, использованную квоту и лимит, после которого проект
   перестанет обслуживать запросы.
3. Выбрать решение: обновить тариф, включить допустимые overages либо снизить
   потребление.
4. Настроить предупреждения по usage до достижения критического лимита.
5. Убедиться, что production project не paused и доступен из Vercel.
6. Повторно проверить `/api/graves`, `/api/cremated` и SQL Editor.
7. Повторить транзакционный burn RPC smoke с финальным `ROLLBACK`.
8. Подтвердить `grave_burn_intents = 0` и `grave_burns = 0` до canary.

## Критерий закрытия риска

Риск можно отметить решённым, когда:

- понятен и принят лимит Supabase для production;
- есть достаточный запас квоты или активирован подходящий тариф;
- настроено предупреждение до исчерпания лимита;
- Vercel и SQL smoke проходят без quota/billing ошибок;
- владелец отдельно разрешил переход к canary burn.

Изменять burn-контракты или повторно применять миграцию для решения этой
проблемы не требуется.
