# Supabase quota / billing risk

**Статус:** отложенный операционный риск для публичного масштаба; по текущему
usage не блокирует один контролируемый canary burn.

**Зафиксировано:** 2026-08-22. **Перепроверено:** 2026-08-24.

**Проект:** `vibecemetery`, production branch `main`, project ref
`lnyfogihvackjwhdvgzo`.

## Что обнаружено

Supabase Dashboard показывает баннер `Grace period is over` и предупреждает,
что на Free Plan после исчерпания квоты обслуживание может быть ограничено.
Это риск тарифа и доступности, а не ошибка burn-схемы или кода.

## Фактический usage на 2026-08-24

- Database Size: `0.028 / 0.5 GB` — около `6%`;
- Cached Egress: `0.155 / 5 GB` — около `3%`;
- Egress: `0.027 / 5 GB` — менее `1%`;
- Storage Size: `0.008 / 1 GB` — менее `1%`;
- Monthly Active Users: `0 / 50 000`;
- Realtime Concurrent Peak Connections: `0 / 200`;
- Realtime Messages: `0 / 2 000 000`;
- Edge Function Invocations: `0 / 500 000`.

Запас Free Plan достаточен для закрытого Preview и одного canary. Переходить на
Pro только ради этой проверки не требуется.

## Состояние данных

- production Supabase отвечает на SQL-запросы;
- Vercel Preview получает `200` от `/api/graves` и `/api/cremated`;
- все 9 исходных graves сохранены и имеют `map_version = 'v1'`;
- `grave_burn_intents = 0` и `grave_burns = 0` по последней SQL-проверке;
- burn migration, forced RLS и server-only RPC активны;
- признаков текущего простоя или quota throttling не обнаружено.

## Остаточный риск

Если позже квота будет исчерпана:

- карта может перестать загружать graves;
- создание и обновление burn intents завершится ошибкой;
- on-chain перевод может временно остаться без статуса в приложении;
- статистика и reverify cron могут стать недоступны.

On-chain перевод не откатывается. Поэтому перед публичным запуском нужны usage
alerts и решение о переходе на Pro/overages. Для одного canary достаточно
перепроверить доступность Supabase непосредственно перед транзакцией.

## Текущая защита

- Production: оба burn-флага `false`;
- защищённый Preview: оба burn-флага `true`;
- Preview использует выделенный Ankr Base Mainnet endpoint через server-only
  `BASE_RPC_URL`;
- реальные intent, burn-записи и переводы пока не создавались;
- после отправки wallet-транзакции UI сохраняет recovery-запись, сразу показывает
  BaseScan, повторяет серверную верификацию и блокирует повторный Burn;
- pending/verified записи дополнительно перепроверяет защищённый cron.

## Перед canary burn

1. Убедиться, что Supabase проект активен и usage остаётся далеко от лимитов.
2. Проверить `GET /api/graves` и `GET /api/cremated`.
3. Подтвердить `grave_burn_intents = 0` и `grave_burns = 0`.
4. Использовать отдельный тестовый wallet с `1 GRAVE` и небольшим Base ETH.
5. Получить отдельное явное подтверждение владельца непосредственно перед
   транзакцией.
6. После canary сверить BaseScan, intent/burn rows и UI total.

## Перед публичным Production-включением

- настроить предупреждения по usage;
- определить порог перехода на Pro/overages;
- повторить Vercel и SQL smoke;
- проверить reverify cron и pending backlog;
- отдельно включить Production-флаги только после release decision.

Изменять burn-контракты или повторно применять миграцию из-за текущих лимитов не
требуется.
