# Project progress: React 19 + Astryx migration

Handoff notes so a new Claude Code session can continue without the earlier conversation.
Last updated: 2026-11-12 (Order Status and Upload refinements committed as `9f8039e`; next: plan the Barcode / Customer Lookup screen, waiting for owner approval), branch `feat/react-astryx`.

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

## Current visual baseline: af314d4 + detail refinements (owner decision)

The owner rejected Art direction v2, the "A 노선 / B 예보" concept mockups, and further radical concepts as over-designed. Decision: return to the clean light look of commit `af314d4` and refine details only. Only the styling files were restored from af314d4 (`theme.css`, `global.css`, `OverviewPage.tsx`, `App.tsx`, `HeroAlert.tsx`); every functional change, test and fix is kept. Kept from later work: the bundled Pretendard variable font (no CDN) and the fixed 거래처별 column widths (`CW`).

Refinements (Overview and Sales first; shared frame, sidebar and table styles also reach the other screens):
- Type: page title 22px, supporting text 13px (was 12), controls 14px, table header 12.5px, table body 13.5px, badges 12px, quarter/year notes 12px; nothing smaller than 12px. 품번 uses the body font's tabular figures instead of an OS-dependent monospace. `tnum` on everywhere.
- Header controls all 32px (team, brands, refresh); they were 28 / 32 / 28.
- Tables: header 32px (two-line headers aligned to the bottom), rows 34px (dense, not 36), 12px cell padding with 16px at the table edge (first sticky cell only on sticky tables, so the second line of a grouped row is not indented), clearer row hover, totals 600 weight.
- Sticky first column: the divider shows only while the table is scrolled sideways (CSS scroll timeline; browsers without it show no divider). Its header cell keeps the header background.
- Sidebar: items 32px / 14px, current item keeps Astryx's neutral grey with 600 weight. No team subtitle, no upload status in the sidebar (owner).
- Overview: four signal tiles with bars kept; tighter tile padding (14/16). Hero alarm keeps the original subtle box (the Astryx Banner's coloured header was too loud).
- Focus ring dark grey instead of black; secondary text #63636c (6.0:1).
- Removed unused CSS (`hero-list`, `text-muted`).
- Final adjustments (owner-approved direction):
  - 거래처 / 품번 picker buttons (`.field-trigger`) look like the search field next to them: white, 1px border, the same dark-border + inner-ring focus; the open state looks focused. Replaces the floating 2px ring.
  - 품목별 search: one row that grows with pasted lines (`field-sizing: content`, max 6 lines; browsers without it keep one scrolling row), 560px wide, shorter placeholder. Multi-line paste, Enter and Shift+Enter unchanged.
  - Phone tables: sticky column keeps a 1px edge + soft shadow (always on phones; on desktop the edge appears only when scrolled), a swipe hint line in the legend, and the 품목별 거래처 column is 8rem on phones (200px on desktop).
  - Phone hero alarm: same 13px text, tighter padding and gaps.
  - 품목별 month cells use 6px side padding: with the new 12px default, '26.10월' was clipped to '26.1…' on desktop and phone. `checkNoClippedCells()` in the e2e test now fails on any clipped table cell on Overview, 거래처별 and 품목별 (verified to fail without the fix).
- Order Status and Upload refinements (owner-approved, commit `9f8039e`):
  - Order Status table: 발주할 수량 column 108px (the '= ① − ② − ③' header no longer wraps to a third line), 가용재고 / 입고예정 96px, 월평균 76px, month columns 64px with 6px side padding (`.dense`). '1,400' / '1,000' were clipped after the shared 12px cell padding.
  - Expanded 근거: the 거래처별 발주 패턴 table spans two grid columns (one on narrow widths, container query); `MiniTable` now takes explicit numeric columns (`num`), cells keep whole words (no 'A상/사'), long names wrap only at spaces, numbers and headers stay on one line, and the table scrolls inside itself if needed.
  - Hero settings table: 품명 / 상태 left-aligned, quantities right-aligned (the old rule right-aligned every column except 거래처 / 날짜).
  - Icons: ⚙ → Cog6ToothIcon, ★ → StarIcon (amber, with an accessible name), 🔄 → ArrowPathIcon on Upload. Texts unchanged otherwise.
  - Summary: 15px regular sentence, only '1개 품목' and '900개' bold in colour; same text so the e2e regex still matches. The calculation paragraph moved into a Collapsible '발주할 수량 계산 방법', closed by default (`defaultIsOpen={false}`; Astryx default is open); its text is unchanged except '행의 ▸' → '행 앞의 화살표 버튼'.
  - Phone: toggle groups wrap, so every 상태 option (7) stays reachable.
  - Upload: long paragraphs split into short list items with the same information (`.help-list`); success message is a subtle green box with an icon (`.alert-ok`, same shape as the hero alarm) instead of the filled Banner; '좌측 메뉴에서 Main을 확인하세요' → '전체 개요를 확인하세요' (`uploadDoneText`, marked `port:`; views.test.js maps the new wording back to production's for the comparison, e2e checks the new text).
  - New e2e checks: no clipped cells on Order Status (default, expanded detail, rules open; desktop and phone), no word broken inside a table cell in the expanded detail (`checkNoBrokenWords`), hero table alignment, help closed by default, phone filters all inside the screen and the last one clickable. Both the clip check and the phone filter check were verified to fail with the fixes removed.
- Later (owner): a subtle horizontal-scroll hint for the Order Status table on phones, like the Sales legend line.
- Approved by the owner. Not done (owner): the depletion timeline in expandable order details (later); Order Status and Upload refinements wait for a review round.

## Art direction v2 (current; owner asked for a real recomposition, not colour tweaks)

- **Font:** Pretendard 1.3.9 variable font is bundled from npm (`pretendard` package, dynamic subset: 92 woff2 chunks, 3.1 MB in total, the browser downloads only the chunks a page uses). The jsDelivr link in `index.html` was removed. `npm run e2e:preview` checks that 'Pretendard Variable' is loaded and used with every CDN blocked.
- **Type system** (`theme.css`): page title 24/640, section title 15/620, headline figure 44/650, signal figure 22/640, controls 13/500, table 13, table header 11.5/560, supporting 12. Tabular numbers everywhere (`tnum`).
- **Identity:** each section title sits on a 1px rule in the text colour (`.section-head`), the app's recognisable mark. One accent, iris `--app-accent` (#4b4bc8, 6.9:1), for the current nav item, links, focus and the brand mark only.
- **Overview composition** (`OverviewPage.tsx`): a wide work column (hero alarm → 발주 필요 with a large count headline and the urgent table) and a 19rem summary column (재고 신호등 as a ledger of clickable rows with bars, then 거래처 / 6-month sales). Under 1100px it becomes one column with the work column first.
- **Sidebar:** canvas background with a hairline, current item = iris-tinted background + iris icon + bold label, team shown under the app name.
- **Tables:** quiet grey header band with top and bottom rules, 36px rows with lighter row lines than borders, tables inside sections are flush (`.flush`, no card border).
- Desktop page gutter is 24px (wider pushed the 발주 현황 table off-screen at 1440px); phone keeps the Astryx default.

## Visual direction A "떠 있는 작업면" (superseded by v2) (owner chose A of three mockups, applied)

- Owner compared A (Linear-like floating panel), B (Vercel-like monochrome with Geist), C (dark sidebar console); mockups were made by injecting a stylesheet into the running app.
- Applied in `src/styles/theme.css` only (plus a stat padding tweak and the 거래처별 column widths):
  - light grey canvas `#f5f5f6`; on desktop (≥768px) the page sits on a white panel with a 1px border and 12px radius (`.astryx-layout-content .astryx-layout` — scope matters: the AppShell itself is also an Astryx Layout, so unscoped `.astryx-layout` / `.astryx-layout-header` rules hit the shell's hidden header and add a top band);
  - sidebar has the canvas colour; selected item is a white pill with a hairline border and the accent icon;
  - one accent `--app-accent` (#545fc8 light / #8b93e8 dark) for the selected-nav icon and links only;
  - type: page title 22px, section title 14px, KPI 28px; secondary text #67676f (≥4.9:1 on every background used);
  - tables: header without background (one bottom rule), 38px rows, soft hover.
- 거래처별 table now uses fixed column widths (`CW` in SalesPage.tsx) like the other tables: with Astryx's `max-width: 0` cells the automatic layout clipped brand names, and lifting it on one column made that column take all spare width.

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

## Preview mode (test data only)

- `npm run build:demo` builds into `web/dist-demo/` (git-ignored) with `VITE_DEMO_DATA=1`. `src/app/demo.ts`: skips login and shared mode, applies the test sheets from `src/lib/__fixtures__/sheets.js` through the normal upload path, replaces `window.fetch` with a function that always rejects (no Apps Script, no `/api`), and makes 새로고침 / 지금 가져오기 re-apply the test data. A banner says it is test data. A normal `npm run build` contains none of this (checked: 0 bundle files).
- Verified in Chromium (desktop + iPhone 13): data loads, no page errors, `fetch('/api/me')` is blocked; only the CDN libraries and font load.
- **Login gate fix:** on any host other than localhost, `shared.gated` starts `true`; preview mode must set it to `false` (`startDemo`), or the app stays on "로그인 정보를 확인하는 중입니다...". `npm run e2e:preview` builds the preview and checks it as static files on a non-localhost host (`preview.test`), desktop + phone: no login screen, test data shown, `/api` and Apps Script fetches blocked, refresh re-applies test data.
- **`web/vercel.json` pins the preview build** (`npm run build:demo` → `dist-demo`, Vite) so a dashboard setting like `npm run build` can't produce the normal app there. The normal app on a host without `/api` falls back to local mode, where 새로고침 would fetch the production Apps Script URL. Only projects with Root Directory `web` read this file. **Remove or change it at cutover.**
- Hosting (owner is setting it up): a **separate** Vercel project from the same repo, Root Directory `web`, build `npm run build:demo`, output `dist-demo`, production branch `feat/react-astryx`, no environment variables, deployment protection on. The existing production project is not touched.

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

**Test status:** `npm test` gives 121 / 121:

| File | Checks |
|---|---|
| `legacy.test.js` + `format.test.ts` | 31 + 3 |
| `views.test.js` | 72 (56 compared with production, incl. 5 hero-alarm cases and 35 order-status filter cases; 14 for new features: Overview tile → 발주 현황 counts for 7 cases, no-sales items made visible, 거래처별 totals vs raw sales for 6 cases, missing / current periods, one-month shift regression with month-unique quantities in 3 date formats) |
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

`npm run typecheck` and `npm run build` are clean. Planted-bug checks: 38 real bugs so far (incl. 6 one-month shift bugs: parser ×2, month key ±1, quarter label, display cell; the display one is caught by e2e's cell-by-cell check against the raw sheet), all caught (some only after adding test steps). One planted change was equivalent to the original and could not be caught, by design.

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
