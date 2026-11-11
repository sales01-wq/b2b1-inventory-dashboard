# Project progress: React 19 + Astryx migration

Handoff notes so a new Claude Code session can continue without the earlier conversation.
Last updated: 2026-11-11 (after the Overview screen), branch `feat/react-astryx`.

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

## Folder map (`web/`)

| Path | Contents |
|---|---|
| `src/lib/store.js` | `state`, `ui`, `settings` (production shape) + `emit`, `subscribe`, `getVersion` |
| `src/lib/parse.js` | sheet signatures/detection, 5 ERP parsers, `num`, `parseDateStr`, team detection |
| `src/lib/forecast.js` | brand/team/warehouse rules, `gradeFor`, order patterns, `computeDerived`, forecast CSVs (`forecastCsv`, `forecastListCsv`) |
| `src/lib/sales.js` | pivot, per-customer shortage, SKU status, `skuStatusCsv` |
| `src/lib/lookup.js` | barcode/name lookup, export list actions, LOT recommendation, `buildExportRows`, PLT (`computePltForRow`, `packPalletsMixed`, `calcExportPlt(inputs)`), `exportCsv` |
| `src/lib/views.js` | screen calculations: `overviewModel`, `heroAlertModel`, `forecastModel`, `forecastDetail`, `customerTableModel`, `skuSearchMatches`, `skuStatusModel`, `mselItems`, `rulesModel`, `rulesValid`, `heroInput`, `addForecastPnTokens`, `addPnTokens`, `shortQuarter`, `forecastNextText`, `patternNextText`, `syncStatusText`, `metaLineText`, `uploadDoneText` |
| `src/lib/actions.js` | `setTeam`, `toggleBrand` (copied from the old click handlers) |
| `src/lib/upload.js` | `unresolvedFiles`, `handleFiles` (uses globals `Papa`/`XLSX`), `applyUploadedData(mode)` → `{error}` or `{updatedList, reusedList}` |
| `src/lib/format.ts` | `fmt`, `fmtDec`, `fmtDays` |
| `src/data/shared.js` | Google login, `/api/*`, snapshot + IndexedDB cache, new-data check, updater refresh, chunked fallback, `refreshFromGoogleSheet(url)`, `logout()`. UI state lives on `shared`: `gated`, `gate`, `bar`, `infoText`, `gsStatus`, `gsLoading`, `syncText`, `gsUrl` |
| `src/data/settings.js` | rules/hero/box settings: `settingsLoadLocal`, `persistSetting`, `loadRemoteSettings`, `setBoxDim`, `persistBox`, `canEditSettings` |
| `src/app/` | `App.tsx` (start order, login gate, sidebar, user menu, jump to overview after data loads), `GlobalFilters.tsx`, `StatusBanners.tsx` (`MessageBanner`), `routes.ts`, `useHashRoute.ts`, `useStore.ts`, `Providers.tsx` (theme + `ko-KR`), `defaults.ts` |
| `src/views/` | `PageFrame.tsx` (title, description, summary line, global filters), `DataPage.tsx` (done), `OverviewPage.tsx` (done), `HeroAlert.tsx` (shared hero alarm banner, reuse on the forecast page), `ForecastPage`/`SalesPage`/`LookupPage` (placeholders), `MigrationPlaceholder.tsx` |
| `docs/CALC_LOGIC_INVENTORY.md` | every calculation with its `index.html` line number, priority and status |
| `e2e/upload.mjs` | browser test: upload → overview values → team switch (`npm run e2e`; set `SHOT_DIR` to save a screenshot) |

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

**Test status:** `npm test` gives 103 / 103 identical to production:

| File | Checks |
|---|---|
| `legacy.test.js` | 34 |
| `views.test.js` | 56 (incl. 5 hero-alarm cases read from both production alarm boxes) |
| `shared.test.js` | 12 |
| `actions.test.js` | 1 |

`npm run e2e` passes and now also checks the overview numbers (B2B1: 위험 1 / 주의 1 / 여유 3, 20 / 20 / 60 %, 참고 6, 거래처 4, 7,080).
`npm run typecheck` and `npm run build` are clean. Planted-bug checks: 18 bugs so far, all caught.

## Remaining work (in this order, one screen at a time, report after each)

The old code to port lives in root `index.html`. Line numbers refer to commit `d369ec2`.

1. **판매 현황 (`SalesPage`), two sub-views**
   - **거래처별 (by customer)** (`renderCustomerTable` ~1752, `customerTableModel()`):
     - customer and item-number multi-selects (`mselItems`, 150-row cap with a "N개 더" message);
     - pasting item numbers with `addPnTokens`, the item search, quarter columns (`shortQuarter`, `QUARTER_COLORS`);
     - grouped rows with `rowspan` when 2 or more customers are selected; "더 보기" adds 50 more rows;
     - customer datalist.
   - **품목별 (by item)** (`renderSkuStatusSearchResults` ~1568, `renderSkuStatusTable` ~1596): search (80 results, "add all"), chips, monthly table with totals row, `skuStatusCsv`.
2. **발주 현황 (`ForecastPage`)** (`renderForecast` ~1404, `forecastModel()`, `forecastDetail()`)
   - **Filters:** grade chips with counts; brand chips; customer select; customer shortage chips (`topShort`); search; item-number chips (`addForecastPnTokens`); "show items without sales" checkbox; overstock scope radios (`renderForecastOverstockScope` ~1268).
   - **Summary bar:** text from `needItems`/`needQty`, plus the CSV button (`forecastListCsv`).
   - **Hero alarm:** reuse `<HeroAlert />` at the top (production shows the same alarm here).
   - **Table:** 50 rows per page; columns brand, item no., hero ★, name, grade (`groupOf`), order qty, horizon + `forecastNextText`, available, incoming, monthly average (avgQuarterly / 3), last 6 months.
   - **Expandable detail row:** pattern table, last 20 sales, warehouse table (`warehouseTableHtml` ~2049, **not ported yet**), incoming rows.
   - **Selection:** checkboxes, select all / none, selected panel (`renderForecastSelectPanel` ~1346), `forecastCsv`.
   - **Rules / hero editor** (`renderForecastRules` ~4035): `rulesModel`, `rulesValid`/`RULES_INVALID_MSG`, `heroInput`, `persistSetting`, read-only unless `canEditSettings()`; after saving, `computeDerived()` + `emit()`.
3. **바코드 · 거래처 조회 (`LookupPage`)**, the most complex screen. Read these old functions first:
   - `renderLookupBatch` 2358, `renderResultBlock` 2256, `warehouseTableHtml` 2049, `expiryTableHtml` 2082, `incomingChipsHtml` 2123, `productMasterHtml` 2211, `renderExportPanel` 2680, `renderPltPackingHtml` 2830, the export column helpers (`EXPORT_COL_DEFAULTS`, `colWidth`, `stickyLeftOf` ~2150), `editableDimsCell`/`editableNumCell` 2573, and the lookup event wiring after 3207.
   - Move any calculations found there into `views.js` with comparison tests.
   - Table needs: Astryx `Table` with sticky-column and column-resize plugins; pallet size inputs **must be `NumberInput`** (see Gotchas); `calcExportPlt({L, W, H, baseHeight, tare, mixMode})`; `exportCsv()`; `setBoxDim()` for the editable box cells.
4. **Finishing:**
   - Add a `saveCsv({csv, filename})` helper (Blob + `<a download>`, as before) once the first CSV button exists.
   - Split the bundle (812 KB now) per page.
   - Check dark mode and accessibility.
   - Extend `e2e/` with one flow per screen.
5. **Before cutover (owner approval required):** see Testing requirements. Cutover means changing the Vercel build to use `web/` and must be tested on a preview first. Not started; do not do it without approval.

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

- Do they approve the look of the frame, upload and overview screens (screenshots were sent) before the remaining screens are built?
- When will the ERP samples be available?
- Is Vercel preview deployment enabled? A pushed branch may already create a preview that also serves the `web/` source files.
