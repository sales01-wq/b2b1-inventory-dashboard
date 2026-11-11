# Project progress: React 19 + Astryx migration

Handoff notes so a new Claude Code session can continue without the earlier conversation.
Last updated: 2026-11-11 (Sales period clarity, subtle badges), branch `feat/react-astryx`.

**Next step needs owner approval:** the owner reviews the improved Overview and Sales (screenshots, Impeccable audit 25 → 28/40, then the owner's follow-up fixes below). Do not restyle other screens or start the lookup screen until they approve.

## Goal

Rebuild the inventory dashboard (production: `index.html` + `api/` on Vercel) as a React 19 app using the
Astryx design system, in `web/`. Same features, same calculation results, same Google login / Apps Script /
Vercel API. Korean UI, left sidebar, clean and responsive for daily use.

## Rules from the owner (must follow)

- **Do not change production:** `index.html`, `api/`, `vercel.json`, root `package.json`. Never change Vercel settings or production environment variables.
- **Do not delete existing files**, including the old copies `vercel_app (7)/` and `inventory_dashboard (94).html`.
- **Commit and push only to `feat/react-astryx`.** Never merge into `main`, open a pull request, or deploy without explicit approval.
- **Preserve every feature and every calculation result exactly.** Do not simplify or remove functionality.
- **Use Astryx components** wherever appropriate.
- **Follow Ponytail's coding rules**: the plugin is enabled in `.claude/settings.json`, pinned to v5.3.3. In short: smallest complete change, no new abstractions or dependencies without need, tests for non-trivial logic.
- **Report after each major step** with results and test status (screenshots welcome). The owner wants to approve the look before more screens are built the same way.
- **Before pushing, scan for secrets** (API keys, tokens, OAuth client IDs, emails).

## How the migration works (key decision)

1. **Logic is copied, not rewritten.** The function bodies in `web/src/lib/*.js` and `web/src/data/*.js` were
   extracted from `index.html` with a parser, unchanged. They stay plain JavaScript and use the same global objects
   (`state`, `ui`, `settings`, `shared`) as before. Every edit is marked with a `port:` comment and only replaces
   code that wrote to the old page.
2. **The production page is the test oracle.** `web/src/lib/__fixtures__/harness.js` loads the real root
   `index.html` in jsdom (`loadOracle()`) and the new modules (`loadPort()`), both at the same fixed date `NOW`.
   The tests run the same scenario on both and require identical results (`canon()` normalises Maps, Sets and Dates).
3. **React connection:** code that changes state calls `emit(event?)` (`web/src/lib/store.js`). Components call
   `useStore()` (`web/src/app/useStore.ts`, built on `useSyncExternalStore`) and read `state`/`ui`/`shared` directly.
   Calculations shown on screen come from model functions in `web/src/lib/views.js`, not from code inside components.
4. **Screens draw only.** Any calculation found inside an old `render*` function goes into `views.js` (copied the
   same way) and gets a comparison test against what the production page actually draws.

## Design direction (approved by the owner, Impeccable round 1 done)

Brief: modern, compact, professional B2B SaaS in the style of Linear and Vercel, built with Astryx components. Korean UI and the Overview's horizontal progress bars must stay.

- **Theme** (`src/styles/theme.css`): Astryx themes are CSS variable overrides, so this one file sets the look for every screen. Zinc-like greys, 1px borders, 8px / 6px radii, near-invisible shadows (strong shadow only on pop-ups), compact type (20px page title, 15px section title, 12px supporting, 26px KPI figures), dark-mode values for everything. Secondary text is `#6b6b74` so it passes 4.5:1 even on the grey table-header background.
- **Colour rule:** colour only for status (위험 / 주의 / 여유) and brand. No other decorative colour (the old per-quarter colours were removed because they matched the brand colours).
- **Frame (`PageFrame`, `GlobalFilters`):** title row (title · description | data status · refresh); filter row (team | brands with a pressed "모든 브랜드" when no brand is picked | data summary without team / timestamp, `metaSummaryText`). Phone (< 768px, `useNarrow`): no fixed header; title and one "B2B1팀 · 모든 브랜드" filter button scroll with the page.
- **Impeccable plugin:** project-scoped, telemetry off. Audits are saved in `.impeccable/critique/` (git-ignored). Audit 1: 25/40 (before), audit 2: 28/40 (after). Run audits as two isolated sub-agents (A design review, B detector) as `critique.md` requires.

### Improvements applied (owner-approved, commit after `c57bb81`)
- **Overview:**
  - signal tiles (위험 / 주의 / 여유 / 참고) are links: `openForecastSignal(grade)` in `actions.js` sets 발주 현황 to that status, clears its other filters, and turns on "판매 이력 없는 품목도 보기" only when that status has such items, so the 발주 현황 row count equals the tile number (tested for every Overview case);
  - each tile shows its meaning from the live rules (`소진예상 60일 미만` …) and "신호 품목 N개 중 X%";
  - "발주 필요 (위험+주의)" table: first 8 of `urgentItems()` (existing grades, same order as 발주 현황) with 상태 badge, 발주할 수량 (real 0 shown as 0), 가용재고, 다음 주문 text; link opens 발주 현황 on the same chip;
  - 거래처 수 / 6-month sales moved to one supporting line.
- **Sales:**
  - 거래처별: quarter header "Q1…" with the year above each year's first quarter and a divider line at year changes; selected customers / 품번 shown as removable chips with one "선택 해제"; 합계 footer from `customerTotals(m)`: all filtered rows (not just the shown page); sales add up per row (rows are distinct 품번[+거래처], so no double counting); 가용재고 counted once per 품번 (tested against raw sales);
  - '-' only where no sales record exists; a real 0 shows as 0 (both tables, including footers);
  - 품목별: search results float over the page; Enter / Shift+Enter hint as one line; labels unified ("품번 / 품명 검색", "선택 해제", "CSV 다운로드");
  - phone: 브랜드 column hidden, brand shown under 품명.
- **Accessibility:** contrast fixed; `NoData` heading is h2 (was h3 under h1).

### Owner follow-up (after audit 2)
- 거래처별 합계 row: sales totals only; the 가용재고 cell is empty (stock of different products is never added up). `customerTotals` no longer returns `available`.
- Missing periods: `periodGaps(keys)` (views.js, tested) counts months / quarters with no sales anywhere in the data between two columns. The tables show one narrow hatched column "N개월 없음" / "N분기 없음" there. Cells: '-' = no record, 0 = recorded total 0. A legend under each table explains '-', 0, hatch and 집계 중.
- Current period: `isCurrentPeriod(key)` marks this month / quarter: header note "집계 중" (with a tooltip), light shading on the column.
- Phone: `useScrollRecent(key)` (`app/useNarrow.ts`) opens period tables scrolled to the right end (latest period + 합계) when the columns change; a user's own scrolling is kept. e2e checks it.
- Badges: grade and status badges use Astryx's tinted variants (`red` / `yellow` / `green` / `neutral` / `orange` / `blue`) instead of the solid semantic ones (`error` / `warning` / `success` / `info`), everywhere (발주 현황, Overview, 업로드, user chip). Contrast measured 7.8:1 and 8.7:1. The 🚨 emoji in the 알람 badge was removed.
- 품목별 month columns are 64px (was 70px) so the table still fits at 1440px with a gap column.

## Folder map (`web/`)

| Path | Contents |
|---|---|
| `src/lib/store.js` | `state`, `ui`, `settings` (production shape) + `emit`, `subscribe`, `getVersion` |
| `src/lib/parse.js` | sheet signatures/detection, 5 ERP parsers, `num`, `parseDateStr`, team detection |
| `src/lib/forecast.js` | brand/team/warehouse rules, `gradeFor`, order patterns, `computeDerived`, forecast CSVs (`forecastCsv`, `forecastListCsv`) |
| `src/lib/sales.js` | pivot, per-customer shortage, SKU status, `skuStatusCsv` |
| `src/lib/lookup.js` | barcode/name lookup, export list actions, LOT recommendation, `buildExportRows`, PLT (`computePltForRow`, `packPalletsMixed`, `calcExportPlt(inputs)`), `exportCsv` |
| `src/lib/views.js` | screen calculations: `overviewModel`, `heroAlertModel`, `forecastModel`, `forecastDetail`, `customerTableModel`, `skuSearchMatches`, `skuStatusModel`, `mselItems`, `rulesModel`, `rulesValid`, `heroInput`, `addForecastPnTokens`, `addPnTokens`, `shortQuarter`, `forecastNextText`, `patternNextText`, `syncStatusText`, `metaLineText`, `uploadDoneText`, `warehouseRows` (data part of `warehouseTableHtml`, also needed by Lookup) |
| `src/lib/actions.js` | copied from the old click/input handlers: `setTeam`, `toggleBrand`; sales: `setCustMselSearch`, `setPnMselSearch`, `setCustomerPnSearch`, `toggleCustomer`, `togglePn`, `removePnChip`, `pnEnter`, `mselClear`, `customerMore`, `setSkuSearch`, `skuEnter`, `pickAllSku`, `toggleSku`, `clearSku`, `removeSku`; forecast: `setForecastGrade`, `setForecastBrand`, `setForecastCustomer`, `setForecastSearch`, `setForecastShowNoSales`, `setOverstockScope`, `forecastMore`, `toggleForecastDetail`, `forecastPnEnter`, `removeForecastPnChip`, `clearForecastPnChips`, `setRulesOpen` |
| `src/lib/saveCsv.ts` | `saveCsv({csv, filename})`: Blob + `<a download>` as before |
| `src/lib/upload.js` | `unresolvedFiles`, `handleFiles` (uses globals `Papa`/`XLSX`), `applyUploadedData(mode)` → `{error}` or `{updatedList, reusedList}` |
| `src/lib/format.ts` | `fmt`, `fmtDec`, `fmtDays` |
| `src/data/shared.js` | Google login, `/api/*`, snapshot + IndexedDB cache, new-data check, updater refresh, chunked fallback, `refreshFromGoogleSheet(url)`, `logout()`. UI state lives on `shared`: `gated`, `gate`, `bar`, `infoText`, `gsStatus`, `gsLoading`, `syncText`, `gsUrl` |
| `src/data/settings.js` | rules/hero/box settings: `settingsLoadLocal`, `persistSetting`, `loadRemoteSettings`, `setBoxDim`, `persistBox`, `canEditSettings`; rules editor buttons copied from the old handler: `saveRules(inputs)`, `resetRules()`, `addHero(pn, min, warn)`, `deleteHero(pn)` (they reuse `rulesValid` / `heroInput`) |
| `src/app/` | `App.tsx` (start order, login gate, sidebar, user menu, jump to overview after data loads), `GlobalFilters.tsx`, `StatusBanners.tsx` (`MessageBanner`), `routes.ts`, `useHashRoute.ts`, `useStore.ts`, `Providers.tsx` (theme + `ko-KR`), `defaults.ts` |
| `src/views/` | `PageFrame.tsx` (title, description, summary line, global filters), `DataPage.tsx` (done), `OverviewPage.tsx` (done), `SalesPage.tsx` (done), `ForecastPage.tsx` (done; exports `GradeBadge`), `HeroAlert.tsx` (shared hero alarm banner), `NoData.tsx` (shared no-data state), `BrandBadge.tsx` (brand → Astryx badge colour), `LookupPage` (placeholder), `MigrationPlaceholder.tsx` |
| `docs/CALC_LOGIC_INVENTORY.md` | every calculation with its `index.html` line number, priority and status |
| `e2e/upload.mjs` | browser test: upload → overview → sales → order status → team switch, then phone layout (`npm run e2e`; set `SHOT_DIR` to save screenshots). Helpers: `openWithData()`, `checkStickyColumns()` |

## Status

**Done and pushed:**
1. **Setup:** Vite 6, React 19.3, TypeScript, Astryx 0.7.13 (`core` + `theme-neutral`, exact versions), Heroicons, Pretendard font, `ko-KR` locale, hash routing (`#/overview` …), left sidebar via `AppShell` + `SideNav`.
2. **Logic migration complete:** everything in the folder map above.
3. **App frame:**
   - login gate (Google button rendered into `#gsiBtn`);
   - status banners;
   - team (`SegmentedControl`) and brand (`ToggleButtonGroup` with `type="multiple"`) filters;
   - 🔄 refresh button and data status;
   - user chip and logout in the sidebar footer.
4. **Upload screen (`DataPage`):**
   - shared-data panel (login mode) or Apps Script URL panel (local mode);
   - `FileInput` dropzone, per-file sheet type badge and `Selector`;
   - apply / clear buttons; after applying, it jumps to the overview.
5. **전체 개요 (`OverviewPage`):**
   - hero alarm banner (`HeroAlert`, `heroAlertModel`): first 12 items + "외 N개", title with team;
   - signal tiles 위험 / 주의 / 여유: count, % and an Astryx `ProgressBar` meter in the status colour (replaces the old SVG donuts; same numbers);
   - six stat cards (위험 / 주의 / 여유 / 참고 / 거래처 수 / 최근 6개월 총판매) and the item total with active brands;
   - no data: `EmptyState` with the old empty-state text plus a button to the upload page.
   - The owner approved the horizontal meter bars instead of the old donuts.
6. **판매 현황 (`SalesPage`):** `TabList` (`role="tablist"`) with 거래처별 / 품목별; the last tab stays selected when leaving the page, as before.
   - **거래처별:**
     - `Popover` pickers for 거래처 and 품번: search, "선택 해제", `CheckboxInput` list (150 cap, "N개 더 있음"), item-number chips (`Token`), Enter to add pasted numbers;
     - "품번 / 품명 검색"; button label "거래처 N개 선택";
     - Astryx `Table` (children mode) with `rowSpan` grouping when 2 or more customers are selected, alternating group shading, "더 보기 (N개 더)".
   - **품목별:**
     - `TextArea` search (Enter adds all matches, Shift+Enter makes a new line); results list (80 cap, "N건 매칭", "이 결과 전체 추가", checkboxes, stays open while picking);
     - selected `Token`s with "전체 지우기" and the "합산" note;
     - monthly table with a totals row (`TableFooter`), "엑셀 다운로드" (`skuStatusCsv` → `saveCsv`).
   - Wide tables get a minimum width and scroll sideways on phones instead of squeezing columns.
   - **Owner-requested improvements (done):**
     - quarter colours restored as a coloured bar under each quarter header plus a light column tint (as text colours they were below 4.5:1 contrast);
     - sticky first column in both tables (see Gotchas, "Tables").
7. **발주 현황 (`ForecastPage`):**
   - `HeroAlert` at the top; rules editor in a `Collapsible` (open state kept in `ui.rulesOpen`):
     - inline `NumberInput`s and the production texts;
     - save, reset, the invalid-values message and "저장되었습니다.";
     - hero form and table (`GradeBadge` / "데이터에 없음" / 삭제);
     - read-only text when the user can't edit.
   - **Filters card:**
     - grade `ToggleButtonGroup`: production's chips with counts, plus "과잉재고" from production's dropdown, so one control covers both;
     - brand `ToggleButtonGroup`, customer `Selector`, search, item-number input (Enter → chips, "전체 지우기"), "최근 6개월 판매 이력 없는 품목도 보기";
     - customer shortage `ToggleButton`s and "✕ 전체 보기".
   - Overstock scope `RadioList` when "과잉재고" is selected; summary bar ("지금 발주 필요 N개 품목 / 총 N개" or "지금 발주할 품목 없음") with "표 내려받기(CSV)".
   - **Table:**
     - fixed layout with explicit column widths;
     - 품번 first and sticky (production had 구분 first), with the expand button and ★ for hero items;
     - 4-level grade badge (detailed grade in the tooltip, 긴급 marked);
     - next-order text under ① 3개월 예상수요; 6 month columns; "더 보기".
   - **Expanded row:** pattern table (with "선택됨"), last 20 sales, warehouse table with 합계 / "재고없음", incoming table, notes. It stays inside the visible width while the table scrolls.
   - **Not built (unreachable in production):** the row-selection checkboxes, the "발주할 품목" panel and the selected-items CSV. Production has handlers for them, but `renderForecast` never draws the checkboxes, so users can't reach them. `forecastCsv()` is ported and tested in case it's wanted.

**Test status:** `npm test` gives 120 / 120:

| File | Checks |
|---|---|
| `legacy.test.js` + `format.test.ts` | 31 + 3 |
| `views.test.js` | 71 (56 compared with production, incl. 5 hero-alarm cases and 35 order-status filter cases; 14 for new features: Overview tile → 발주 현황 counts for 7 cases, no-sales items made visible, 거래처별 totals vs raw sales for 6 cases, missing / current periods) |
| `shared.test.js` | 12 |
| `actions.test.js` | 3 (team/brand; 19 sales steps; 28 order-status steps incl. rules save/reset and hero add/delete, each comparing filter state, the full filtered list and saved settings), all driven through production's real controls |

`npm run e2e` passes and checks (since the design round also: '모든 브랜드' toggle, tile and link deep-links into 발주 현황, customer totals row 6,890, '-' cells, phone filter button and scrolling header):
- the overview numbers (B2B1: 위험 1 / 주의 1 / 여유 3, 20 / 20 / 60 %, 참고 6, 거래처 4, 7,080);
- sales: the first pivot row SB001 (1,500 / 6,400), grouped rows and header order, the by-item search with Enter, the 6,400 totals row, and the CSV file name and contents;
- order status:
  - summary "지금 발주 필요 1개 품목 / 총 900개", rows SB004 · SB001, expanding a row (warehouse 합계 2,300);
  - CSV name and contents; 과잉재고 + EMP → SB006;
  - rules: invalid message, save 45 → "소진예상 30~45일", reset;
  - hero add → alarm, delete → alarm gone;
- sticky first columns: no overlap on desktop; still pinned on a phone after scrolling; no page-level sideways scroll.

`npm run typecheck` and `npm run build` are clean. Planted-bug checks: 32 real bugs so far, all caught (some only after adding test steps). One planted change was equivalent to the original and could not be caught, by design.

## Remaining work (in this order, one screen at a time, report after each)

The old code to port lives in root `index.html`. Line numbers refer to commit `d369ec2`.

1. **바코드 · 거래처 조회 (`LookupPage`)** (start only after owner approval), the most complex screen. Read these old functions first:
   - `renderLookupBatch` 2358, `renderResultBlock` 2256, `warehouseTableHtml` 2049, `expiryTableHtml` 2082, `incomingChipsHtml` 2123, `productMasterHtml` 2211, `renderExportPanel` 2680, `renderPltPackingHtml` 2830, the export column helpers (`EXPORT_COL_DEFAULTS`, `colWidth`, `stickyLeftOf` ~2150), `editableDimsCell`/`editableNumCell` 2573, and the lookup event wiring after 3207.
   - Move any calculations found there into `views.js` with comparison tests.
   - `warehouseRows(pn)` already exists (with `picked` for the "추가됨" badge); its `picked` flag is not covered by a test yet because the shipping list is empty in the order-status tests. Cover it when porting the lookup screen.
   - Table needs: Astryx `Table` (use the `sticky-first` / `sticky-col` classes and the column-width approach from `ForecastPage`; column resize is a production feature of the export table); pallet size inputs **must be `NumberInput`** (see Gotchas); `calcExportPlt({L, W, H, baseHeight, tare, mixMode})`; `exportCsv()`; `setBoxDim()` for the editable box cells.
2. **Finishing:**
   - Split the bundle (812 KB now) per page.
   - Check dark mode and accessibility.
   - Extend `e2e/` with one flow per screen.
3. **Before cutover (owner approval required):** see Testing requirements. Cutover means changing the Vercel build to use `web/` and must be tested on a preview first. Not started; do not do it without approval.

## Gotchas

- **Pallet inputs:** production's pallet inputs are `type="number"`. The browser empties text like `1,600`, so the old page fell back to defaults. Use `NumberInput` so the results match.
- **Upload button `mode`:** production's upload button passed the click event as `mode`. The new screen passes `'upload'` (the intended value).
- **CDN libraries:** PapaParse 5.4.1, SheetJS 0.20.3 and Google sign-in load by `<script>` from CDNs in `web/index.html`, exactly as production does. `cdn.sheetjs.com` is blocked in the cloud sandbox, so the Excel path is untested (the code is unchanged). `papaparse` is a devDependency used only by the tests and the e2e test.
- **Login gate:** `#gsiBtn` must exist when `initSharedMode()` runs; `LoginGate` renders it. Start order (from production): `settingsLoadLocal()` → `emit()` → `initSharedMode()`.
- **Localhost:** on localhost the app skips the login gate (same rule as production), so it runs in local upload mode. Login can only be tested on a deployed preview (its URL must be added to the OAuth client's authorized JavaScript origins).
- **TypeScript:** the shared JS objects carry a JSDoc `Record<string, any>` type so TypeScript doesn't infer `null`-only types. `tsconfig` has `allowJs: true`.
- **Playwright:** passing files to `setInputFiles` by Korean file *paths* silently did nothing in this container. Pass `{name, mimeType, buffer}` instead.
- **Test setup:** tests that run the port need `vi.useFakeTimers({toFake: ['Date']})` + `vi.setSystemTime(NOW)`. The oracle realm gets its own fixed `Date` in `harness.js`. The data tests also need `fake-indexeddb` and globals for `window`, `document`, `localStorage` and `google` (see `src/data/shared.test.js`).
- **Production quirk:** `showSettingsError` writes the "설정 저장 실패" message straight to `#sharedBar` (not through `setSharedBar`). The test accounts for this.
- **Production bug fixed (display only):** in the grouped customer table (2 or more customers selected), production's header said "거래처 · 가용재고" but the cells were "가용재고 · 거래처". The new header follows the cells. `views.test.js` still builds the production header order on purpose (it compares the model, not the component); the e2e test checks the new order.
- **Single-line inputs drop line breaks:** the old 품번 picker input (and the new `TextInput`) is single-line, so a pasted column like `A\nB` becomes `AB`. Same in both versions; tests use spaces or commas. The 품목별 search is a textarea and keeps line breaks.
- **Headless downloads:** headless Chromium renames downloads with Korean file names to "download". The e2e test records the name the app puts on the link (`window.__lastDownloadName`) and checks the file contents instead.
- **Tables (read before building the lookup screen):**
  - **Header `max-width: 0`:** Astryx sets `max-width: 0` on header cells for truncation, which silently cancels any `width` you give them. Tables with explicit column widths need `className="fixed-cols"` (CSS: `.fixed-cols th { max-width: none }`) plus `tableLayout: 'fixed'`. Applied to the order-status and 품목별 tables.
  - **Card wrapping:** Astryx's table scroll wrapper has a -16px margin on every side (edge compensation). Always put a table in `<Card padding={0}>`; otherwise it eats the gap above it and nested tables lose their last column.
  - **Sticky first column:** add `className="sticky-first"` to the `Table` and `className="sticky-col"` to the first-column cells (explicit class, not `:first-child`, because `rowSpan` rows start with another cell). `global.css` makes that table's wrapper a real scroll container (`overflow-x: auto`). Without that, the wrapper is `overflow: clip` when the table fits, sticky resolves against the page's padded content edge, and the cell shifts 16px onto its neighbour. Verified by `checkStickyColumns()` in e2e.
  - **Column widths:** with many columns, the automatic table layout squeezes wrappable cells (Korean names, headers) to one character. Use `tableLayout: 'fixed'` with an explicit `width` on each header cell; the sum is the table's `minWidth` (see `W` in `ForecastPage`).
  - **Headers:** Astryx truncates header cells with "…"; add `wrap-head` to the `Table` to let long headers wrap.
  - **Expanded rows:** wrap the content in `.detail-sticky`. The table's scroll wrapper is a CSS size container, so `100cqw` is its visible width, and the detail stays visible while the table scrolls.
  - **Colours:** use existing tokens only. `--color-background-secondary` does not exist; use `--color-background-muted`, `--color-background-surface`, `--color-text-error`, `--color-text-success`.
  - `TextArea` does not forward `onKeyDown`; catch keys on a wrapper element (see `SkuView`).
- **ToggleButtonGroup and empty values:** a group treats `''` as "nothing selected", and clicking the selected button sends `null`. Production uses `''` for "전체", so map it to a placeholder value (`ALL` in `ForecastPage`) and ignore `null`.
- **Accessible names:** every input needs a unique Korean label (the e2e test finds fields by name). The hero form's item field is "히어로 품번".
- **Dead code:** `fetchSnapshot` is unused in production and was not ported. `state.heroMissing` is computed but never shown in production; it is not shown in the new app either.
- **Playwright:** the AppShell content area is the `main` *role*, not a `<main>` tag: use `page.getByRole('main')`. Don't pass `/dev/null` as a screenshot path (unsupported mime type).
- **Test data limits:** the fixture has only 11 forecast items, so cases needing more (e.g. more than 12 hero alarms) build the input directly in both realms, as `withAlerts()` does in `views.test.js`.

## Testing requirements (for every step)

1. **Every new calculation gets a comparison test.** Copy it from `index.html` into `views.js` (or `lib/`) and compare against the oracle in `views.test.js`. Read the production page's drawn values where possible (see `fromOracle`).
2. **Check that the test can fail.** Plant 2 or 3 small bugs one at a time: copy the file to the scratchpad, change one expression (for example `>=` to `>`, or `round` to `floor`), run that test file, then copy the file back. If a bug slips through, add test data until it is caught.
3. **Before every commit, all of these must pass:**
   - `npm test`
   - `npm run typecheck`
   - `npm run build`
   - `npm run e2e`
4. **Screenshots:** desktop 1440×900 at `deviceScaleFactor: 2` and phone (`devices['iPhone 13']`). Check there is no horizontal scroll (`scrollWidth > innerWidth`).
5. **Waiting on the owner:**
   - **Real ERP sample files** for the 5 sheet types. Add them as fixtures (anonymised is fine) and run the same comparison tests on them.
   - **Login and data checks on a Vercel preview**, before any cutover.

## Commands (from `web/`)

```bash
npm install
npm run dev         # http://localhost:5173 (local mode); /api is proxied to http://localhost:3000 (run `vercel dev` in the repo root)
npm test            # comparison tests against production index.html
npm run e2e         # browser test of the upload flow (starts its own server on 5174)
npm run typecheck && npm run build
npm run astryx -- component --dense <Name>   # Astryx component docs
```

## Open questions for the owner

- Approve the improved Overview and Sales? Remaining audit-2 ideas not yet done: on phones the signal tiles sit above the action table; 발주 현황 shows '-' for a 0 order quantity while Overview shows 0, and it has its own brand filter next to the global one.

- Do they approve the 발주 현황 screen and the sales improvements (screenshots were sent)? Wait for approval before starting 바코드 · 거래처 조회.
- Is it fine that the order-status table puts 품번 first (sticky) instead of 구분?
- Should the unreachable production selection feature (row checkboxes → "발주할 품목" panel → selected CSV) be added as a new feature, or left out as in production's actual behaviour?
- When will the ERP samples be available?
- Is Vercel preview deployment enabled? A pushed branch may already create a preview that also serves the `web/` source files.
