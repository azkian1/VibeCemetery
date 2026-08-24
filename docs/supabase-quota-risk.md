# Supabase quota / billing risk

**Статус:** отложенный операционный риск для публичного масштаба; по текущему
usage не блокирует закрытый Preview. Два контролируемых mainnet burn уже
выполнены, поэтому прежний pre-canary нулевой row count больше нельзя считать
актуальным без нового SQL-аудита.

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

Запас Free Plan достаточен для закрытого Preview и ограниченного тестирования.
Переходить на Pro только ради UI acceptance не требуется; эти цифры не являются
обоснованием для публичного масштаба.

## Состояние данных

- production Supabase отвечает на SQL-запросы;
- Vercel Preview получает `200` от `/api/graves` и `/api/cremated`;
- все 9 исходных graves сохранены и имеют `map_version = 'v1'`;
- последняя прямая SQL-проверка до mainnet burn показывала
  `grave_burn_intents = 0` и `grave_burns = 0`;
- после неё приложение приняло две разные транзакции как verified (`666` и
  `100 GRAVE`), поэтому ожидаются как минимум две intent/burn записи; точный
  status breakdown нужно подтвердить новым прямым SQL-запросом;
- burn migration, forced RLS и server-only RPC активны;
- признаков текущего простоя или quota throttling не обнаружено.

## Остаточный риск

Если позже квота будет исчерпана:

- карта может перестать загружать graves;
- создание и обновление burn intents завершится ошибкой;
- on-chain перевод может временно остаться без статуса в приложении;
- статистика и reverify cron могут стать недоступны.

On-chain перевод не откатывается. Поэтому перед публичным запуском нужны usage
alerts и решение о переходе на Pro/overages. Перед любым следующим тестовым
переводом нужно сначала закрыть SQL/stats-проверку уже выполненных транзакций.

## Текущая защита

- Production: оба burn-флага `false`;
- защищённый Preview: оба burn-флага `true`;
- Preview использует выделенный Ankr Base Mainnet endpoint через server-only
  `BASE_RPC_URL`;
- две одобренные Base Mainnet транзакции успешно перевели суммарно `766 GRAVE`
  на фиксированный dead address; исходный server flow вернул verified для обеих;
- после отправки wallet-транзакции UI сохраняет recovery-запись, сразу показывает
  BaseScan, повторяет серверную верификацию и блокирует повторный Burn;
- pending/verified записи дополнительно перепроверяет защищённый cron.

## После выполненного canary и перед следующим burn

1. Убедиться, что Supabase проект активен и usage остаётся далеко от лимитов.
2. Проверить `GET /api/graves` и `GET /api/cremated`.
3. Сверить две expected verified burn rows, связанные intents и отсутствие
   неожиданного pending/orphaned backlog.
4. Подтвердить UI total `766 GRAVE` для могилы
   `2cee0bb3-33f4-429c-a049-d9ad920c5cb7`.
5. Новый перевод не выполнять без отдельного явного подтверждения владельца.

## Перед публичным Production-включением

- настроить предупреждения по usage;
- определить порог перехода на Pro/overages;
- повторить Vercel и SQL smoke;
- проверить reverify cron и pending backlog;
- отдельно включить Production-флаги только после release decision.

Изменять burn-контракты или повторно применять миграцию из-за текущих лимитов не
требуется.
