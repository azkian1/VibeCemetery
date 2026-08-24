# Grave Burn v1 — UI и operational audit 2026-08-24

## Scope

Проверяется только burn-механизм в модалке существующей могилы Cemetery Map
v1. Новый контракт, кабинетный wallet, v2 и Production activation не входят в
эту работу.

## Проверенный UI contract

- в свёрнутом состоянии видны `BURN $GRAVE`, verified total выбранной могилы и
  кнопка `BURN`;
- `BURN` раскрывает существующий action-блок внутри `GraveModal`, не создавая
  второй overlay;
- presets: `1,000`, `5,000`, `MAX`;
- `MAX = floor(balanceRaw / 10^18)`, потому что v1 intent принимает только целое
  положительное количество GRAVE;
- при неизвестном балансе, нуле или балансе меньше `1 GRAVE` кнопка `MAX`
  отключена;
- preset и `MAX` используют `aria-pressed`, disclosure использует
  `aria-expanded` и `aria-controls`;
- `Custom GRAVE amount`, `Choose an offering amount` и input центрированы;
- финальная action-кнопка называется `BURN $GRAVE`;
- dead address показан полностью, увеличен до `12px`, осветлён и безопасно
  переносится в узкой модалке.

## Найдено и исправлено повторным аудитом

1. Saved recovery мог восстановиться внутри свёрнутого блока. Теперь наличие
   `hasPendingTransfer` принудительно раскрывает controls, отключает disclosure
   button и оставляет доступными BaseScan/`Retry Verification`/явный clear.
2. После изменения wallet balance локальный флаг `MAX` мог визуально остаться
   активным для старой суммы. Теперь `MAX` active только когда выбранная сумма
   равна текущему рассчитанному максимуму.
3. При переходе к другой могиле expanded/MAX UI state мог переноситься между
   grave IDs. `EnabledGraveBurnPanel` теперь keyed по `graveId`, поэтому новая
   могила снова открывается компактно, если у неё нет recovery record.
4. Selectable amount buttons не сообщали состояние assistive technologies.
   Добавлен `aria-pressed` и E2E-проверка переключения preset -> MAX -> preset.

## Mainnet evidence

Для могилы `2cee0bb3-33f4-429c-a049-d9ad920c5cb7` пользователь одобрил две
транзакции:

- `666 GRAVE` —
  `0xdb061334361105c8700f939515c17e39f4ca40b29f8c31b83e891b1505811b2c`;
- `100 GRAVE` —
  `0xf03554156875160a6513b5fe1b5b0fd8acd8abf7dd94d0fbef666bac7827c084`.

Read-only Base Mainnet RPC повторно подтвердил для обеих `status = success`,
ровно один GRAVE `Transfer`, правильного sender, fixed dead recipient и точную
сумму. Итого on-chain: `766 GRAVE`. В исходном application flow обе операции
перешли из `202 pending` в `200 verified`.

## Что не объявляется проверенным

- визуальный screenshot acceptance обновлённого Preview: подключение
  in-app browser в этой сессии завершилось локальной ошибкой служебного пути;
- повторный защищённый Preview GET stats: Vercel Deployment Protection
  перенаправил CLI-запрос на login;
- актуальный прямой SQL count/status breakdown после двух транзакций.

Эти ограничения не опровергают on-chain receipts или исходные verified ответы,
но остаются отдельными acceptance/operations пунктами.

## Автоматические проверки после исправлений

- TypeScript: passed;
- full ESLint: passed;
- focused boundary/UI/MAX unit suite: `10/10`;
- fake injected-wallet E2E: `1/1`;
- E2E ABI-корректно подменяет Base Multicall3 `balanceOf`, проверяет переключение
  `1,000 -> MAX -> 1,000`, intent/sign/transfer/server verification и обновление
  visible total;
- `git diff --check`: passed.

Локальный `next build` успешно завершил compile и TypeScript, но page-data
collection ожидаемо остановился без локальных `NEXT_PUBLIC_SUPABASE_URL` и
`SUPABASE_SERVICE_KEY`. Это не кодовая ошибка burn UI; окончательный build gate
закрывается Vercel Preview, где общие project env уже настроены. Существующее
Turbopack-предупреждение об `@theme inline` не относится к этой правке.

## MAX regression из Preview-приёмки

Проверка Preview с wallet balance `7,218,756 GRAVE` выявила проблему на границе
Supabase/PostgREST. Значение `numeric(78,0)` из `amount_raw` возвращалось как
JSON number. JavaScript преобразовывал raw amount в `7.218756e+24`, а viem
корректно отклонял экспоненциальную запись как недопустимый `uint256`. Перевод
токенов при этой ошибке не отправлялся.

Store теперь выбирает все uint256-размерные значения из базы с явным текстовым
cast PostgREST: `amount_raw::text`; block numbers обрабатываются так же. Создание
и авторизация intent, поиск burn и повторная верификация сохраняют точные
десятичные строки end-to-end и не пропускают суммы токенов через JavaScript
`Number`. Регрессионная проверка покрывает обнаруженный MAX balance и наличие
текстовых cast во всех соответствующих запросах.

## Ручная приёмка владельцем

1. Открыть защищённый Preview и реальную v1-могилу.
2. В свёрнутом виде подтвердить `BURN $GRAVE` и total `766 GRAVE`.
3. Нажать `BURN`; проверить компактность, центрирование и читаемость полного
   dead address.
4. Подключить wallet без отправки новой транзакции; проверить `1,000`, `5,000`,
   `MAX`, wallet balance и Base network state.
5. В Supabase подтвердить две verified burn rows и отсутствие неожиданного
   pending/orphaned backlog.

До выполнения отдельного release decision Production-флаги должны оставаться
`false`; новые реальные переводы не требуются.
