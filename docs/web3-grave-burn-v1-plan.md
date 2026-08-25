# GRAVE Burn Offering — план запуска на Cemetery Map v1

**Целевая поверхность:** `/cemetery`, Cemetery Map v1.

**Экономическая модель:** только добровольный burn offering.

**Техническая база:** intent-bound реализация из
[`docs/web3-grave-burn-mvp.md`](./web3-grave-burn-mvp.md).

## 0. Release contract

Burn v1 реализуется без нового Solidity-контракта. Релизная единица включает
точный commit приложения, focused migration
`docs/web3-grave-burn-v1-finish.sql`, конфигурацию Preview и защищённый
reverify/acceptance.

До применения shared Supabase migration необходимо:

1. выключить оба burn-флага во всех существующих Preview deployments;
2. непосредственно перед SQL повторить read-only baseline и проверить stop
   conditions из release runbook;
3. получить отдельное подтверждение владельца на изменение общей Production
   database schema;
4. развернуть тот же проверенный commit в новом immutable Preview и выполнить
   acceptance до любого Production-включения.

Production burn UI и write API остаются выключенными до отдельного решения.
Реальный перевод GRAVE, push, deploy, изменение environment variables и SQL не
следуют автоматически из готовности кода. Live deployment IDs, project refs,
baseline fingerprints, transaction hashes и operator wallet addresses хранятся
только во внешних или игнорируемых operational records.

## 1. Зафиксированное продуктовое решение

На данном этапе единственная токеновая utility VibeCemetery — добровольное
GRAVE-подношение существующей могиле.

Пользователь переводит GRAVE на фиксированный burn address, после чего
VibeCemetery независимо проверяет транзакцию в Base Mainnet и привязывает
подтверждённое подношение к конкретной могиле.

В этот релиз не входят:

- награды пользователям или владельцам могил;
- split `50/25/25`;
- treasury transfer;
- staking, farming, quests или governance;
- claim, exhumation или наследование слотов;
- обязательная токеновая оплата захоронения;
- offering во время создания могилы;
- глобальные burn-лидерборды;
- постоянные косметические состояния могил;
- отдельный cemetery smart contract;
- глобальный Connect Wallet в кабинете или TopBar;
- Agent Layer, Agent Ash или CLI `/bury` tokenomics.

`Press F` может остаться бесплатной социальной механикой. Он не является
токеновой utility и не влияет на GRAVE offering ledger.

## 2. Токен и семантика burn

Зафиксированная конфигурация:

```text
Network: Base Mainnet
Chain ID: 8453
Token: VibeCemetery (GRAVE)
Token address: 0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3
Decimals: 18
Burn address: 0x000000000000000000000000000000000000dEaD
Confirmations: 2
```

Контракт GRAVE — верифицированный DERC20. Его нативная функция
`burn(uint256)` имеет ограничение `onlyOwner` и не может использоваться
обычным держателем токена. Поэтому пользовательский MVP использует стандартный
ERC-20 `transfer(burnAddress, amount)`.

Это permanently inaccessible transfer, но не уменьшение значения
`totalSupply()`. Пользовательский текст должен говорить:

```text
Sent permanently to the burn address.
```

Допустимый ритуальный текст:

```text
BURN $GRAVE
Irreversibly transfer GRAVE to the dead address on Base.
```

До отдельного изменения контракта нельзя утверждать:

```text
Total supply destroyed
Supply reduced by this offering
```

## 3. Почему запускаем на v1

- `/cemetery` — текущий production-маршрут кладбища.
- Production-навигация уже ведёт пользователей на `/cemetery`.
- v1-могилы имеют UUID, `slot_id` и существующий `GraveModal`.
- Burn ledger привязывается к `grave_id`, поэтому сама карта не является
  частью on-chain транзакции.
- Весь intent, verification, pending/reorg и stats backend уже реализован;
  требуется изменить map boundary, а не переписывать Web3-систему.

## 4. Реализованный фундамент

В кодовой базе уже существуют:

- `src/web3/config.ts` — фиксированные chain/token/burn параметры;
- `src/web3/abi.ts` — минимальный ERC-20 ABI;
- `src/web3/Web3Provider.tsx` — route-scoped Wagmi provider;
- `src/web3/useGraveBurn.ts` — клиентский state machine;
- `src/components/web3/WalletButton.tsx` — injected-wallet UI;
- `src/components/modals/grave/GraveBurnPanel.tsx` — offering UI;
- `src/lib/web3/*` — server config, intent, verification, store и service;
- `/api/graves/[id]/burn-intents` — создание intent;
- `/api/graves/[id]/burn-intents/[intentId]/authorize` — авторизация intent;
- `/api/graves/[id]/burns` — stats и submit transaction;
- `/api/internal/grave-burns/reverify` — защищённый reverify endpoint;
- `docs/web3-grave-burn-mvp.sql` — таблицы, функции, RLS и агрегаты;
- `vercel.json` — резервный reverify cron ежедневно в 03:00 UTC, совместимый
  с Vercel Hobby; основной submit flow проверяет транзакцию немедленно;
- unit/security и fake-wallet E2E тесты.

Этот фундамент сохраняется. Нельзя заменять его прямым доверием к данным из
браузера.

## 5. Реализованные изменения для Map v1

### 5.1. Подключить Web3 provider на `/cemetery`

Файл:

```text
src/components/CemeteryApp.tsx
```

v1 `GameProvider` обёрнут в `Web3Provider`, чтобы модалка могилы получила
доступ к подключению кошелька и burn-транзакции на `/cemetery`.

Целевая форма:

```tsx
<Web3Provider>
  <GameProvider>
    ...v1 cemetery...
  </GameProvider>
</Web3Provider>
```

`Web3Provider` должен продолжать возвращать `children` без Wagmi hooks, когда
`NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED !== 'true'`.

### 5.2. Разрешить GraveBurnPanel на v1

Файлы:

```text
src/components/modals/GraveModal.tsx
src/components/modals/grave/GraveBurnPanel.tsx
```

В текущей v1-реализации панель отображается только при выполнении
всех условий:

```text
public feature flag включён
AND mapVersion === 'v1'
AND открыта реальная могила
AND graveId является UUID
AND slotId существует
```

Meta grave, пустые слоты, preview grave и несуществующие записи не должны
показывать burn UI.

`WalletButton` рендерится внутри этой панели. Сам `transfer` не вызывается
напрямую из общей модалки: сначала сервер создаёт grave-specific intent,
кошелёк подписывает его, и только после server authorization UI вызывает
ERC-20 `transfer`. После транзакции backend принимает только
`intentId + txHash` и самостоятельно проверяет Base receipt.

### 5.3. Сменить server-side grave boundary с v2 на v1

Файлы:

```text
src/lib/web3/burnStore.ts
src/lib/web3/burnService.ts
src/app/api/graves/[id]/burn-intents/route.ts
```

Прежний метод `findV2Grave(graveId)` заменён на явно названную v1-проверку:

```ts
findBurnableV1Grave(graveId)
```

Запрос обязан проверять:

```text
graves.id = graveId
AND graves.map_version = 'v1'
```

Нельзя принимать `mapVersion` из browser body как доверенное поле. Разрешённая
версия карты определяется серверной реализацией релиза.

API-ошибка должна быть нейтральной и актуальной:

```text
Grave not found on Cemetery Map v1.
```

### 5.4. Сохранить grave-specific signed intent

До token transfer сервер создаёт одноразовый EIP-712 intent, включающий:

```text
intentId / nonce
graveId
wallet
expectedRawAmount
chainId = 8453
tokenAddress
burnAddress
expiresAt
```

После создания intent браузер отправляет только:

```ts
{
  intentId: string
  txHash: `0x${string}`
}
```

Нельзя принимать после транзакции доверенные значения `graveId`, wallet,
amount, token address, burn address, GitHub username или verified status.

### 5.5. Сохранить текущую transaction verification

Backend обязан независимо подтвердить:

- Base Mainnet chain ID `8453`;
- успешный receipt;
- достаточное количество confirmations;
- sender транзакции и подписавший intent wallet совпадают;
- лог принадлежит фиксированному GRAVE-контракту;
- существует ровно один подходящий `Transfer`;
- `Transfer.from` совпадает с wallet;
- `Transfer.to` равен фиксированному burn address;
- `Transfer.value` в точности равен intent amount;
- receipt block не предшествует авторизации intent;
- `txHash` ранее не был использован;
- timestamp блока transfer не раньше авторизации и не позже expiry intent;
- момент появления receipt у RPC может быть позже expiry — это не отменяет
  транзакцию, которая была добыта в допустимом окне;
- intent не был использован другой транзакцией.

Только `status = 'verified'` влияет на публичную статистику.

## 6. UI для v1

Панель размещается внутри существующего `GraveModal` после основной информации
о могиле и до бесплатных социальных действий.

Минимальный состав:

```text
BURN $GRAVE

0 GRAVE BURNED
[BURN — expand controls]

Irreversibly transfer GRAVE to the dead address on Base.
Your wallet and optional GitHub display name become public after verification.

[Connect Wallet]
[1,000] [5,000] [MAX]
[Custom GRAVE amount — up to 18 decimals]
[BURN $GRAVE]

Top Mourners
```

Обязательные состояния:

```text
Connect Wallet
Wrong network — Switch to Base
Not enough GRAVE
Preparing the grave intent
Sign the grave intent
Confirm the transfer in your wallet
Transaction submitted — verifying on Base
Confirmed — indexing pending
Ritual accepted
Transaction rejected / failed
```

Правила:

- custom amount — canonical положительное значение максимум с 18 дробными
  знаками и не выше EVM `uint256` boundary;
- для контрольной mainnet-проверки можно использовать `1 GRAVE` через custom;
- никакого auto-connect, auto-sign или auto-transfer;
- кнопка блокируется на всех pending шагах;
- до подтверждения показываются token, amount, network и burn destination;
- pending транзакция не увеличивает публичный total;
- verified транзакция обновляет stats и подсвечивает v1-слот;
- ссылка на BaseScan появляется после получения tx hash.

## 7. База данных

Используется существующая миграция:

```text
docs/web3-grave-burn-mvp.sql
```

Основные таблицы:

```text
grave_burn_intents
grave_burns
```

Основные функции:

```text
expire_grave_burn_intent(...)
authorize_grave_burn_intent(...)
bind_grave_burn(...)
reverify_grave_burn(...)
get_grave_burn_stats(uuid)
```

Текущая версия `bind_grave_burn` принимает также
`p_transfer_block_timestamp`. Если receipt временно отсутствует, функция
атомарно сохраняет `pending`-запись без block artifact до expiry. Такая запись
не влияет на статистику, но остаётся доступной защищённому reverify cron. Когда
receipt появляется, block timestamp проверяется против времени авторизации и
expiry intent.

Полный MVP SQL повторно применять не требуется, если базовая Web3 migration уже
установлена и `graves.map_version` существует. Для текущего hardening один раз
нужно применить только `docs/web3-grave-burn-v1-finish.sql` после read-only
preflight и отдельного подтверждения владельца. Актуальная последовательность
описана в `docs/web3-grave-burn-v1-finish-runbook.md`.

Перед включением необходимо подтвердить:

- foreign keys указывают на production `graves`;
- v1 grave UUID корректно принимаются функциями;
- `tx_hash` глобально уникален;
- RLS включён и принудительно применяется;
- таблицы и функции недоступны browser `anon`/`authenticated` ролям;
- запись выполняется только сервером через service role.
- в Postgres отсутствует старый overload `bind_grave_burn` с восемью
  аргументами и доступна новая версия с девятью аргументами.

## 8. Переменные окружения

Обязательные server-only значения:

```env
WEB3_GRAVE_BURNS_ENABLED=false
BASE_RPC_URL=
GRAVE_BURN_REVERIFY_SECRET=
CRON_SECRET=
```

Browser flag:

```env
NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=false
```

Опциональный browser-safe read RPC:

```env
NEXT_PUBLIC_BASE_READ_RPC_URL=
```

Правила:

- `BASE_RPC_URL`, `GRAVE_BURN_REVERIFY_SECRET` и `CRON_SECRET` никогда не
  помещаются в `NEXT_PUBLIC_*`;
- production verification не использует публичный Base RPC;
- browser RPC должен быть origin-restricted;
- если добавляется browser RPC origin, CSP расширяется только этим HTTPS
  origin, без wildcard;
- server flag остаётся авторитетным и должен fail closed.

## 9. Изменения тестов

### 9.1. Boundary tests

Обновить `tests/grave-burn-map-boundary.spec.ts`:

- Web3 provider присутствует в `CemeteryApp` v1;
- burn panel разрешён на v1;
- burn panel отсутствует на v2 в рамках этого релиза;
- panel отсутствует при выключенном public flag;
- Wagmi hook не вызывается до проверки feature flag;
- meta/preview/empty grave не получает burn panel.

### 9.2. Server tests

Обновить fixture/store интерфейсы:

- существующая v1-могила принимает создание intent;
- v2-могила отклоняется;
- отсутствующая могила отклоняется;
- schema without `map_version` fails closed;
- browser не может изменить map version;
- все существующие intent, signature, duplicate, reorg и stats тесты остаются
  зелёными.

### 9.3. E2E

Fake-wallet E2E должен открывать `/cemetery`, а не `/cemetery/v2`, затем:

1. открыть реальную fixture v1-могилу;
2. подключить fake injected wallet;
3. переключиться на Base;
4. раскрыть панель кнопкой `BURN` и выбрать `1 000 GRAVE`;
5. подписать intent;
6. подтвердить stubbed transfer;
7. отправить только `intentId + txHash`;
8. получить `verified`;
9. обновить stats;
10. вызвать один `highlight_slot` для v1 slot id.

### 9.4. Полные regression gates

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run test:web3-e2e
npm run build
```

## 10. Этапы rollout

### Этап A — локальная адаптация

- подключить provider к v1;
- открыть panel для v1;
- перевести server grave lookup на v1;
- обновить UI copy;
- обновить тесты и документацию;
- пройти regression gates.

На этом этапе реальные токены не используются.

### Этап B — staging

- применить Web3 migration и RLS;
- настроить dedicated Base RPC;
- настроить secrets;
- проверить API origin/body/rate-limit controls;
- проверить cron вручную и по расписанию;
- пройти fake-wallet E2E против staging UI;
- проверить MetaMask и Rabby;
- проверить, что server secrets отсутствуют в browser bundle и логах.

### Этап C — контролируемая Base Mainnet проверка

Требуется отдельное явное человеческое подтверждение перед транзакцией.

- использовать отдельный тестовый wallet;
- иметь минимальный ETH для Base gas;
- использовать custom amount `1 GRAVE`;
- проверить отображаемые token/address/amount перед подтверждением;
- проверить BaseScan receipt и единственный Transfer на burn address;
- проверить intent и burn записи в Supabase;
- дождаться `verified` после двух confirmations;
- проверить grave total, Top Mourners и highlight;
- проверить reverify следующего cron cycle.

### Этап D — public activation

Порядок включения:

1. Включить `WEB3_GRAVE_BURNS_ENABLED=true` на сервере.
2. Проверить закрытый API smoke без публичного UI.
3. Включить `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=true`.
4. Проверить `/cemetery` в production.
5. Наблюдать ошибки RPC, pending backlog, duplicate rejects и stats latency.

## 11. Rollback

Экстренное отключение не требует изменения контракта или удаления данных.

```env
WEB3_GRAVE_BURNS_ENABLED=false
NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=false
```

После выключения:

- новые intents и submissions получают safe unavailable response;
- UI не монтирует Wagmi hooks и не показывает offering panel;
- существующие verified records сохраняются;
- pending/reorg записи не удаляются;
- cron можно оставить включённым для завершения безопасной re-verification или
  остановить отдельным операционным решением.

Vercel environment variables не изменяют уже собранный deployment. Для
фактического rollback после установки Preview-флагов в `false` необходимо
создать новый Preview deployment, дождаться `Ready` и только затем переключить
Preview branch alias. Production alias и Production env при этом не меняются.

Нельзя удалять burn records или повторно использовать tx hash при rollback.

## 12. Критерии готовности

Burn на v1 считается готовым только когда выполнены все условия:

- offering panel появляется на реальной v1-могиле в `/cemetery`;
- v2, meta grave и пустые слоты не принимают offering;
- выключенные flags полностью скрывают UI и закрывают write API;
- пользователь видит точные chain, token, amount и burn semantics;
- intent подписывается до transfer;
- backend принимает после transfer только `intentId + txHash`;
- неверный sender/token/recipient/amount/chain отклоняется;
- duplicate tx не считается дважды;
- pending не попадает в total;
- verified обновляет total и Top Mourners;
- reorg удаляет orphaned burn из статистики;
- cron защищён secret и работает в production;
- unit, E2E, TypeScript, lint и build проходят;
- результат явно одобренного canary полностью проверен on-chain, в Supabase и
  UI, а точные transaction/baseline evidence сохранены вне tracked docs;
- `MAX` round-trip сохраняет полный `balanceRaw`, включая дробную часть, а
  просроченные неподписанные intents автоматически становятся `expired`;
- пользовательская документация не обещает уменьшение `totalSupply`.

## 13. Следующие фазы, не входящие в этот план

После стабильного production burn и появления реальной активности можно
отдельно рассматривать:

- optional offering во время burial;
- визуальные thresholds: candle, flowers, ravens, smoke;
- Most Burned Graves и Fresh Ashes;
- Chapel с глобальной verified статистикой;
- cosmetic grave care.

Каждая следующая фаза требует отдельного решения. Модель `50/25/25`, owner
rewards, treasury, claim и inheritance не является продолжением этого плана и
не должна появляться без нового smart contract design и отдельного одобрения.
