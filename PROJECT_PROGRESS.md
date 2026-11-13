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

8. **바코드 · 거래처 조회 (`LookupPage`), Phase 1 of 3 — approved by the owner and committed.** Owner decisions: alternatives move into a collapsible section in each card (open when there are any, a one-line note when none); warehouse rows stay add-only (removal only from the download list); mouse drag-to-scroll is part of this screen.
   - **Input:** one card with 바코드 / 품번 and 품명 `TextArea`s (grow with content), 거래처 `TextInput` with the customer list (`datalist`), 조회, "바코드 지우기" (clears the barcode text and results, keeps 품명 / 거래처, as before), and a closed "입력 방법" `Collapsible` with the old help text. Input text lives in `ui.lookup*Text` so it survives page changes.
   - **Results bar:** "조회 결과 N개 품목 · 못 찾음 N건", "선택 항목 보기 (N)" (N = download-list rows; scrolls to the download-list anchor), the "대체품목도 함께 담기" checkbox, "전체 추천 선택 (N개 품목)" (2+ items, as before). Not-found and "N개 더" messages per input.
   - **Product card (was 5 panels + a right column):** head = 품번, brand, 품명, 거래처 · 바코드 · the input that matched; 필요 수량 (`NumberInput`, applied when the field is left or Enter, like the old change event) with "선택 창고 재고 대비 ±N개"; 추천 선택; 선택완료 (collapses to one line with the selection summary). Clicking the head toggles the old "선택됨" mark. Body: 창고별 가용재고 | 유통기한 (LOT) side by side (one column when the card is under 720px), 입고예정 chips below. Foot: 박스 · 중량 (`Collapsible`, open state in `ui.masterInfoExpanded`; only values missing in the file are editable, saved through `setBoxDim`) and the alternatives.
   - **Selection states:** every selectable row has a checkbox column, a light green row tint and the old "추가됨" badge; incoming chips are Astryx `SelectableCard`s. Warehouses: add-only (clicking a picked row or its checkbox does nothing). LOTs and incoming chips: toggle. Rows work by mouse (whole row) and keyboard (checkbox, Space).
   - **Drag-to-scroll (`app/useDragScroll.ts`):** horizontal overflow areas inside the page only; starts after 6px; a drag never becomes a row click; ignored on inputs, buttons, checkboxes, labels and `.col-resize-handle`; a mostly vertical drag is left to text selection; Alt + drag always selects text. Phase 2's 34-column table will get it automatically.
   - **Phase 1 placeholder:** below the results, a "다운로드 목록 (N)" card marks where Phase 2 puts the table, PLT and CSV.
   - **Phase 2 — download list (`views/ExportPanel.tsx`, `exportPanelModel()` in `views.js`), committed:** all production columns in production order (33 incl. the delete column; 'PLT 최대 적재 가능 박스수' is shown only in per-item mode, as before), a group header row (바코드 · 창고 · 배분 / 입고예정 / 유통기한 / 박스 정보 / PLT 계산) replacing the old coloured header text, 삭제 / 전체 지우기, priority and needed-qty inputs (applied when the field is left), × to remove an incoming date or a LOT, editable box cells (only values missing from the file; the card and the list show the same values), 3 sticky columns (phone: 품번 only, otherwise they cover the screen), column resize by dragging the header edge or with ← → on the focused handle (widths kept in `ui.exportColWidths` for the session, as before), drag-to-scroll. Box-size columns default to 200px instead of 130px so the W × D × H inputs fit (production's inputs overflowed the cell). Fixed along the way: the collapsed card's '펼치기' button toggled twice and stayed collapsed.
   - **Phase 3 — PLT and CSV, committed:** pallet inputs (가로 · 세로 · 최대높이 · 밑판 두께 · 빈 PLT 무게, `NumberInput`, empty / 0 fall back to production's defaults inside `calcExportPlt`), 혼적 X / O (`SegmentedControl`; like production the choice and the inputs take effect only when 'PLT 계산' is pressed), the four result figures as a stat strip plus the two basis notes, 'PLT 상세보기 / 숨기기' with the mixed-pallet composition as a table (same content as production's cards), '엑셀 다운로드' (`exportCsv()` → `saveCsv`, file `재고선택목록_YYYY-MM-DD.csv`). Deliberate UI differences: entered pallet values stay after calculating (production reset the inputs to 110 / 110 / 150 / 15 / 20 on every redraw, so a second calculation silently used the defaults unless retyped); very long PLT number / weight / size lists scroll inside their cell (one item could make a row thousands of pixels tall). The table PLT columns, results and CSV are compared with production.
   - Logic: no calculation changed. New view helpers in `views.js` (`expiryRows`, `incomingChips`, `boxModel`, `boxCompactRows`) and actions in `actions.js` (`lookupSearch`, `pickWarehouse`, `pickExpiry`, `pickIncoming`, `setNeededQty`, `autoSelectOne/All`, …) wrap the existing ported functions. Values passed on are stringified like production's `data-*` attributes.

**Test status:** `npm test` gives 122 / 122 (the lookup comparison now has 57 steps):

| File | Checks |
|---|---|
| `legacy.test.js` + `format.test.ts` | 31 + 3 |
| `views.test.js` | 72 (56 compared with production, incl. 5 hero-alarm cases and 35 order-status filter cases; 14 for new features: Overview tile → 발주 현황 counts for 7 cases, no-sales items made visible, 거래처별 totals vs raw sales for 6 cases, missing / current periods, one-month shift regression with month-unique quantities in 3 date formats) |
| `shared.test.js` | 12 |
| `actions.test.js` | 3 (team/brand; 19 sales steps; 28 order-status steps incl. rules save/reset and hero add/delete, each comparing filter state, the full filtered list and saved settings), all driven through production's real controls |
| `lookup.view.test.js` | 1 (57 lookup steps; Phase 3 adds per-item / mixed / empty-input PLT runs, the mixed detail and 3 CSV downloads, each compared with production (results, notes, composition cards, CSV text and file name); since Phase 2 every step also compares the whole download list cell by cell (by production's `data-col`), incl. priority (empty / 0 → 1) and the allocation order, needed qty and box values entered in the list, removing rows / incoming dates / LOTs / LOT-added rows, clear all. Originally 33 steps driven through production's real lookup controls: search with quantities / commas / duplicates / customer / 품번 / empty input, warehouse add-only incl. 재고없음 and alternatives, LOT and incoming toggles, needed qty incl. 0, per-item and all recommendations with and without alternatives, collapse, active mark, box section, clear. Each step compares every rendered table row, chip, badge, diff text, collapsed summary and the selection lists) |

`npm run e2e` passes and checks (since the design round also: '모든 브랜드' toggle, tile and link deep-links into 발주 현황, customer totals row 6,890, '-' cells, phone filter button and scrolling header):
- the overview numbers (B2B1: 위험 1 / 주의 1 / 여유 3, 20 / 20 / 60 %, 참고 6, 거래처 4, 7,080);
- sales: the first pivot row SB001 (1,500 / 6,400), grouped rows and header order, the by-item search with Enter, the 6,400 totals row, and the CSV file name and contents;
- order status:
  - summary "지금 발주 필요 1개 품목 / 총 900개", rows SB004 · SB001, expanding a row (warehouse 합계 2,300);
  - CSV name and contents; 과잉재고 + EMP → SB006;
  - rules: invalid message, save 45 → "소진예상 30~45일", reset;
  - hero add → alarm, delete → alarm gone;
- sticky first columns: no overlap on desktop; still pinned on a phone after scrolling; no page-level sideways scroll.
- lookup (desktop): result counts, pasted quantity, warehouse add-only by row and by checkbox, keyboard Space, LOT and chip toggles, need diff after editing, alternatives open (2) / none note, 추천 선택 → 재고없음, 전체 추천 선택, "선택 항목 보기" scroll, collapse summary, box input kept after close/open, fixed values not editable, no clipped cells, "바코드 지우기";
- download list (desktop): row count = title = '선택 항목 보기', 33 header cells, 3 sticky columns before / after scrolling and after widening a column, allocation follows priority (300 / 700 / 0 → after changing priority), needed qty and box values entered in the list appear in the card, 삭제 unticks the card's warehouse, column resize by mouse (+60px, table does not scroll) and keyboard (+10px), drag-to-scroll, no clipped cells, 전체 지우기;
- PLT and CSV (desktop): per-item result and filled PLT columns, 33 → 32 columns only after recalculating with 혼적 O, entered width kept, mixed total = rows in the composition table, detail show / hide, CSV file name, header, 합계(혼적 기준) row and one line per pallet;
- download list (phone): PLT inputs and buttons inside the screen (this caught an overflow), only 품번 sticky, the last column can be scrolled fully into view, no clipped cells;
- lookup (phone): no clipped cells, no control outside the screen, a vertical drag does not scroll the table, a horizontal mouse drag scrolls it and is not treated as a row click (fails with the hook removed), a plain click still selects.

`npm run typecheck` and `npm run build` are clean. Planted-bug checks: 38 real bugs so far (incl. 6 one-month shift bugs: parser ×2, month key ±1, quarter label, display cell; the display one is caught by e2e's cell-by-cell check against the raw sheet), all caught (some only after adding test steps). One planted change was equivalent to the original and could not be caught, by design.

## Final verification (after Lookup phase 3)

All run on the branch with test data only:
- `npm test` 122 / 122 (comparison tests against production `index.html` for parsing, calculations, all screens' rendered values, upload, shared login mode, order-status and lookup interactions), `npm run typecheck`, `npm run build`, `npm run e2e`, `npm run e2e:preview`.
- e2e covers all five screens on desktop and iPhone 13: CSV upload → overview → sales (both tabs, CSV) → order status (filters, rules, hero items, CSV) → lookup (cards, download list, PLT, CSV) → team switch; and now the Google Sheets (Apps Script web app) path against a fake web app: a failing URL shows "새로고침 실패: 웹앱 호출에 실패했습니다 (상태 500)…", a working one applies the same data as the CSV upload.
- Shared login mode (Google sign-in + `/api/*`) is covered by `shared.test.js` against a fake Google library and fake API, compared with production.

**Not verifiable here (needs real files, credentials or a live environment):**
- Excel (.xlsx) upload: it uses SheetJS from `cdn.sheetjs.com` like production, and that host is blocked in this environment; only CSV was tested. Check with a real ERP .xlsx on a preview.
- Real Google sign-in (Google Identity Services with the real client ID and company domain) and the real Vercel API with production data.
- The real Apps Script web app and its data.
- Results on real ERP exports (fixtures are synthetic).

## Real-world verification (in progress)

**Done locally (no credentials, test data only):**
- Route-based code splitting: each screen is its own chunk and is preloaded right after start-up (no blank page on first visit). Libraries are split into `react` / `icons` / `astryx` chunks. The remaining large chunk is the Astryx library itself (~1.06 MB, ~340 kB gzip; motion and gesture internals used by `AppShell`), so `chunkSizeWarningLimit` is 1100 with the reason in `vite.config.ts`. Two e2e checks now wait for the lazily loaded page.
- **Read-only preview switch `VITE_READ_ONLY=1`** (off by default; production behaviour unchanged without it): no `POST /api/settings` (box / rules / hero stay in that browser), no `/api/data?action=update` or `action=ensure`, no Apps Script web-app call in upload mode; a "읽기 전용 미리보기" banner. Reads still work. Reason: any logged-in user's box-size input is saved to the shared production settings, and '새로고침' runs the Apps Script that processes the Drive upload folder. `VITE_WEBAPP_URL` can override or empty the default Apps Script URL. Covered by `src/data/readonly.test.js` (fails if the guard is removed).
- Real (non-demo) build served on a non-localhost host with no `/api` (as a Preview without env vars): falls back to upload mode, CSV upload → all five screens, no JavaScript errors; console errors only for CDNs blocked in this sandbox (Google sign-in, SheetJS) and the missing `/api/config`; no Apps Script calls, no POSTs. The demo fixtures are not in the real bundle.
- **Excel:** with SheetJS 0.18.5 from npm (scratch copy, not a project dependency; production uses 0.20.3 from `cdn.sheetjs.com`, blocked here) a multi-sheet workbook with numeric cells (5 data sheets + a memo sheet) plus a separate B2B2 sales workbook: every sheet recognised as in production (memo → "자동 인식 실패 — 직접 선택"), the B2B2 file by its name, and the results identical to the same data as CSV. Uploaded through the built React page: same overview.
- **`src/lib/realdata.test.js`** (skipped unless `ERP_DIR` is set): loads every CSV / Excel file in a folder into production `index.html` and into the new code and compares sheet recognition, the raw rows, parsed data, per-team forecasts, scoped stock, sales pivot, item sales, customer shortages, forecast and item CSVs, the lookup of every item with the recommended selection (alternatives included), LOTs, the download list, PLT per-item and mixed, and the download CSVs. Passed on the synthetic CSV and Excel sets. Usage: `ERP_DIR=folder XLSX_LIB=path/to/xlsx.full.min.js npx vitest run src/lib/realdata.test.js`; the files stay on that computer.
- Sandbox quirk: Playwright could not attach files from disk whose paths contain Korean characters (the same files attached as buffers, with Korean names, work). Real browsers need a manual check with real file names.

**Needs the owner (credentials, live services or real files):** see the verification plan in the conversation of 2026-11-12: a separate Vercel project for the Preview, the OAuth origin, environment variables, the Apps Script source to confirm which actions write, real ERP files, and manual browser checks.

## ERP collector MVP (`collector/`, mock data only)

Windows PC collector → `ERP_BUNDLE_*.zip` in the existing Drive upload folder → Apps Script (existing 5-minute trigger) → sheet → snapshot → dashboard. No new server or database; product master untouched.
- `collector/` (Node): validates all 5 files with the dashboard's own parser (`web/src/lib/parse.js`: sheet type, team, rows, no collapse vs previous), skips unchanged data (content hash), lock against overlapping runs, one zip per batch (a single Drive file, so the per-file watcher cannot apply half a batch), no stacking while the previous bundle is pending, keeps the last good state on any failure, re-uploads after an Apps Script rejection (`FAILED_` bundle). Real ERP adapter is a skeleton (`src/adapters/erp.js`); Windows scripts for encrypted credentials (DPAPI) and Task Scheduler (at logon + every 30 min).
- (superseded by `Batch.gs`, see the manual-upload section) `collector/apps-script/ErpBundle.gs`: additive Apps Script code (unzip → validate all → write all to `__new_*` tabs → swap by rename with rollback; allow-list of tab names; product master tab protected). Existing code changes: 3 lines in `checkForNewFilesInner_`. **Not applied to production**; apply to a copy first.
- Tests: `cd collector && npm test` (39): collector flow and guards, and the Apps Script code on fake Drive / Sheets objects (all-or-nothing, rollback on write failure, master protection, temp sheets cleaned). Mutation checks confirmed.
- Confirmed file names (from the Drive folder): `가용재고조회_olive`, `WMS창고재고관리(EMP)_olive` (expiry / LOT data), `일자별판매실적분석_{date}_B2B1팀` / `_B2B2팀`, `제품일정표_olive`; product master (`상품마스터_전체`) is never collected and the bundle code refuses any `상품마스터*` tab. The collector always writes the `…B1팀` / `…B2팀` names: the dashboard picks the team from the file (tab) name first and falls back to the 부서 column for older names without 팀 (tested). Allowed tabs: 가용재고조회, WMS창고재고관리, 일자별판매실적분석, 제품일정표.
- Recorded ERP workflow implemented in `collector/src/recipe.js` (5 downloads: 가용재고조회, WMS창고재고관리(EMP) with 'emp 정상' / 물류센터 1101480001 / 재고현황, 일자별판매실적분석 B2B1팀 then B2B2팀 via the dept popup rows, 제품일정표). The accidental '1월 + 조회' of the first sales attempt was dropped; sales picks the start date (월 → 1월 → 선택됨) and stops unless the field shows this year's Jan 1. Session comes from the browser profile (no credentials in code); `npm run try -- <id> --show` downloads and validates one file without uploading. Tested in Chromium against a fake site with the same structure (iframes, calendar, dept popup by coordinates, right-click export); the real ERP's behaviour (whether '선택됨' picks day 1, the popup row order, result load time) is only confirmed on the PC.
- Credentials: `npm run set-credentials` (`src/credentials.js`) replaces the blocked `.ps1`: hidden password prompt (no echo, asked twice), saved with DPAPI via `powershell -Command` (not a script file, so the execution policy is untouched; the secret goes through stdin as base64, never argv / files / logs), verified by reading back. Non-ASCII accounts round-trip. Real DPAPI is only exercised on Windows (test skipped elsewhere).
- Automatic re-login (`recipe.login`, `src/auth.js`): reuses the profile session, otherwise logs in with the DPAPI-stored account (read lazily), unambiguous login form only (one password field, one text field or `login.userSelector`); stops without bypassing on CAPTCHA, post-login MFA/OTP, unknown screens; max 2 consecutive failed attempts (account-lockout guard, `npm run reset-login`); one re-login + retry if the session drops mid-run; errors are scrubbed of the account name / password. Tested in Chromium against a fake login site (auto-login, mid-run expiry, wrong password, CAPTCHA, MFA, ambiguous form, scrubbing); mutation-checked. The real login screen, whether the account needs MFA, and company policy approval are unconfirmed. The ERP URL is plain `http://` (credentials in clear on the network).
- Real ERP download: `src/adapters/erp.js` runs Playwright (persistent profile, DPAPI credentials) and calls a PC-side `erp-recipe.js` (`login`, `download`) recorded with `playwright codegen`; tested in a real Chromium against a local fake ERP (login → 5 downloads → validation → bundle; one failed download publishes nothing). The ERP's actual screens / selectors are still unknown.
- Known limits: the 3-line change to `checkForNewFilesInner_` and the real Drive / Apps Script runtime are untested here; file names in `collector/src/files.js` (except `가용재고조회_olive`) are assumptions; the dashboard shows the existing "마지막 업데이트 · 수집기(자동)" time but not collector errors (they are in the PC's `run.log` / `state.json`).

## Project priorities (owner, latest)
- **Phase 1 (now): the dashboard product.** Design consistency, UX, refining and extending features, better inventory / sales / purchase-order analysis, fixing incomplete interactions and performance, daily-use polish. The Drive → Apps Script → dashboard pipeline is kept as is (the manual-upload hardening below is done; no more infrastructure work for now).
- **Final goal: direct integration with the K-System Ace ERP** (no manual Excel). The ERP automation work in `collector/` is preserved; troubleshooting (HTTP→HTTPS block, IT approvals) is postponed until Phase 1 is complete.
- The Phase 1 review and roadmap is in the conversation of 2026-11-12 (summary: P1 order-status and overview usability, P2 item detail view and trend charts, P3 customer analysis, P4 alerts / exports, P5 polish and performance).

## Manual-upload workflow completed (ERP automation paused)

The ERP browser automation is paused (see the HTTP→HTTPS finding below); all of `collector/` is kept, the scheduled collector and automatic uploads stay disabled. The manual workflow, step by step (`collector/수동-업로드-가이드.md`):
1. ERP Excel files downloaded by hand → **`npm run pack -- "<folder>"`** (`collector/src/pack.js`): finds the five files by name (dates, `(1)`, `B2B1` vs `B2B1팀` tolerated; the product master and unknown files are skipped, newest wins), validates all with the dashboard's parser, and only if all five pass writes the files under the existing naming rules plus one `ERP_BUNDLE_*.zip` to a local folder. It never writes to Drive.
2. Files (or the optional zip) → the existing Drive upload folder → Apps Script. New additive Apps Script code, **not applied to production** (built against the owner's original code, `collector/apps-script/original/Code.redacted.gs`; the combined project is exercised by `integration.test.js` through the original entry points `checkForNewFiles` / `doGet`): `Batch.gs` (replaces the per-file loop: all files in the folder — loose Excel files and/or zips — are read and validated first, written to `__new_*` tabs, swapped by rename with rollback, and only then moved; one bad file leaves every sheet and file untouched and the reason is recorded; product master upload and changed-files-only uploads still work), `DryRun.gs` (read-only `dryRunReport` / `dryRunSnapshot` / `dryRunBatch` / `dryRunBundle` to check real data without changing anything) and `SnapshotGuard.gs` (`buildSnapshotChecked_`: validates the snapshot — required sheets with data, product master must stay if it existed, no row collapse > 50% — and only then replaces it; otherwise the last valid snapshot stays and `SNAPSHOT_PROBLEM` / `BUNDLE_ERROR` are recorded; `readProblems_` exposes them in the `bundle` response).
3. `api/snapshot.js` passes `problem` through `X-Meta`; the dashboard shows "최근 업로드 문제" (keeps showing the previous data) and "데이터가 오래되었습니다" (≥ 36 h). The client also refuses to cache / apply a received snapshot that lacks inventory or sales content (`snapshotProblem`).
4. Browser upload (DataPage) now checks before applying (`uploadChecks`): header-only file, sheet type / header mismatch and file-name team ≠ 부서 team block the apply (current data untouched); a row count below half of the current one needs a confirmation.
- **Bug found in the existing settings path (fixed on this branch, not deployed):** `api/_lib.js` `callGas` appends `key` (the Apps Script secret) after the params, so `api/settings.js`'s setting name (`key`) was overwritten by `GAS_KEY`: every shared setting of a kind collapsed into one row keyed by the secret, the secret was written to the `__설정` tab and returned in `GET /api/settings`. `api/settings.js` now sends `skey`; Apps Script edit 4 reads it (falls back to `key` during the transition). After deploying, rotate the key and clear the old rows (see the guide).
- Tests: `web` 134 (new: `sync.test.js`, `pipeline.test.js` = files → pack → Apps Script fake → snapshot → dashboard results equal the direct upload for all teams, and a wrong upload leaves sheets and snapshot untouched), `collector` 57, e2e (adds the header-only upload block), preview e2e. Mutation checks on both Apps Script guards.
- Not verified here: the real Drive / Apps Script runtime (only fakes; the 5 edits to existing functions are untested), real ERP files, real Google login / Vercel env vars. Manual steps are in the guide.

## ERP access finding: Chrome upgrades the ERP's HTTP address to HTTPS (confirmed on the owner's PC)

`npm run netcheck` on the company PC (installed Chrome; dedicated profile and a fresh profile alike):
- The ERP's `http://` address answers 200 from Node; no server-side redirect.
- In the Playwright-controlled Chrome the main document goes through an **internal 307 Temporary Redirect** with `non-authoritative-reason: HttpsUpgrades` (Chrome's own HTTP→HTTPS upgrade, not the server), and the resulting `https://` navigation fails with `net::ERR_BLOCKED_BY_CLIENT`. The HTTPS request is blocked client-side, so the login page is never reached.
- `chrome://policy` reported no explicit `HttpsOnlyMode` / `HttpsUpgradesEnabled` policy. The regular Chrome opens the ERP normally (probably by falling back to HTTP; not confirmed).
- Likely explanation of the difference (consistent with the evidence, not proven): the owner's regular Chrome shows "This site does not use a secure connection (HTTPS)" and "Security warnings have been turned off for this site", i.e. a per-site, per-profile exception that exists only in that profile. The collector's dedicated profile and a fresh profile have none, so Chrome tries HTTPS first and the attempt is blocked. The exception cannot be copied into the collector's profile (editing browser preference files would bypass the protection, and Chrome blocks remote debugging of the default profile). The managed equivalent is the Chrome policy `HttpAllowlist` for this host (applies to every profile on the PC), or an HTTPS address for the ERP.
- Comparison with the original recording setup (no rollback needed): the recording and the collector launch Chrome the same way (Playwright persistent context, installed Chrome, `--enable-automation`, `--remote-debugging-pipe`, `--disable-extensions`, and a default `--disable-features` list that already contains `HttpsUpgrades` in Playwright 1.63). The only things that can differ are the Playwright minor version (1.63 pinned vs the latest at recording time; the relevant defaults match), the Chrome version (company PCs auto-update; newer Chrome versions upgrade / warn on http through mechanisms that Playwright's older switch list does not cover) and per-profile state (a "continue to site" decision lives only in the profile where it was made). `ERR_BLOCKED_BY_CLIENT` is also what Chrome reports when a security warning interstitial replaces the navigation, which would fit the regular Chrome's "security warnings turned off for this site". Port 443 of the ERP is unreachable, so HTTPS is not possible without IT (an HTTPS endpoint) and the browser-side exception must come from a managed `HttpAllowlist` policy. `recipe.openErp` now turns this failure into a clear message pointing to the IT request.
- Not yet known: what blocks the HTTPS request (`blockedReason` and the full policy list were not reported) and whether the ERP serves HTTPS at all.
- Decision: do **not** disable HTTPS upgrades, add insecure flags, or bypass company controls. Options for IT (see `collector/IT-요청서.md`, ERP host left as a placeholder on purpose): (1) an IT-approved HTTPS address for the ERP (preferred; it also encrypts credentials), (2) the Chrome policy `HttpAllowlist` for this one host, (3) identify what blocks the HTTPS request, (4) a read-only ERP API or an ERP-side scheduled export instead of browser automation. Until one is in place the unattended collector cannot log in; uploads stay disabled. No code change is needed except `erpUrl` if an HTTPS address is provided.
- Read-only checks the owner can run on the PC: `Test-NetConnection <ERP host> -Port 443` and `curl.exe -sS -I --max-time 15 https://<ERP host>/` (without `-k`).

## Remaining work (in this order, one screen at a time, report after each)

The old code to port lives in root `index.html`. Line numbers refer to commit `d369ec2`.

1. **바코드 · 거래처 조회 (`LookupPage`)**: All three phases done (see Status 8). Final verification of all five screens follows. Old functions:
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


- Is it fine that the order-status table puts 품번 first (sticky) instead of 구분?
- Should the unreachable production selection feature (row checkboxes → "발주할 품목" panel → selected CSV) be added as a new feature, or left out as in production's actual behaviour?
- When will the ERP samples be available?
- Is Vercel preview deployment enabled? A pushed branch may already create a preview that also serves the `web/` source files.

## Update 2026-11-12: Preview project build
- `web/vercel.json` now builds the normal app (`npm run build` → `dist`) instead of the fixture-only demo build, so real ERP files can be uploaded on the preview. Set `VITE_READ_ONLY=1` (and no other variables) in the separate preview project; no `/api`, Google login or Apps Script. Root Directory `web`, production branch `feat/react-astryx`, Deployment Protection on. Not deployed yet (waiting for owner approval).

## P1~P5 구현 (web/, feat/react-astryx) — 실제 구현 내용
- **P1** 개요: 월별 판매(최근 12개월) · 재고 점검 요약 · 곧 주문할 거래처 3칸 추가. 화면 모드 밝게(기본)/어둡게/자동(사이드바 하단, 이 브라우저에 저장). 화면 로딩 자리표시(Skeleton) + 화면 오류 안내(ErrorBoundary). 발주 현황 '3개월 예상수요' 열 너비 조정. 표 안 품번은 키보드로도 열 수 있는 버튼.
- **P2** 상품 상세 패널(우측 Drawer): 개요 · 발주 현황 · 판매 현황 · 거래처 분석 · 재고 점검 · 조회의 품번을 누르면 같은 패널. 가용재고 · 입고예정 · 월평균 판매 · 발주할 수량 · 소진 예상일 · 12개월 판매 막대그래프 · 창고별 재고 · 입고예정 · LOT/유통기한 · 거래처별 주문.
- **P3** 발주 목록(새 화면): 발주 현황에서 행별/'발주 필요 N개 담기', 상세에서 담기 → 수량 수정 → CSV(UTF-8 BOM, 엑셀에서 열림). 목록은 이 브라우저(localStorage)에 저장. '조회에서 확인'은 바코드 · 거래처 조회에 `품번 수량`을 넣고 조회 실행. (.xlsx 파일 출력은 하지 않음: CSV 로 엑셀 열기 가능)
- **P4** 거래처 분석(마지막 주문 · 주문 간격 · 다음 주문 예상 · 6개월 수량/금액 · 주요 품목, 주문일 3일 이상일 때만 간격 계산) · 재고 점검(유통기한 90/180/365일 · 6개월 무판매 재고 · 소진 1년 초과 재고).
- **P5** 전체 검색(Ctrl+K / 사이드바 버튼: 품번 · 품명 · 바코드 → 상세 패널) · 발주 현황 저장된 보기(이름 저장/불러오기/삭제, 이 브라우저) · 6만 줄 판매실적에서 새 계산 합계 1초 이내 테스트.
- **만들지 않은 것 (데이터 없음):** 재고 추이 · 지난 업로드 대비 변화(재고 이력 저장소 필요), 재고금액/원가 기준 분석(올라오는 파일에 원가 없음), 품목별 공급 리드타임(전체 규칙만 있음).
- 검증: tsc · vitest 143(142 통과 + 실제파일 비교 1 건너뜀) · build · e2e(upload · preview · features 데스크톱/휴대폰) · collector 57 통과. 헤드리스 Chromium 은 한글 CSV 파일 이름을 'download' 로 보고하지만 실제 Chrome 저장 이름은 영향 없음(기존 CSV 도 같은 방식).

## 발주 현황 계산 방식 변경 (feat/react-astryx, 운영 미반영)
- **목표 재고** = 최근 12개월(이번 달 제외, 달력 기준) 중 모든 거래처 합계 월 판매량의 최댓값. **부족 수량** = max(0, 목표 − 가용재고 − 유효 입고예정). 거래처 주문 주기 예측은 쓰지 않음.
- 반품 · 마이너스 조정은 판매와 분리(목표에 불포함). 입고예정은 날짜가 지난 것을 제외(화면에 제외 수량 표시). 재고 · 입고예정은 품목당 한 번만 계산(거래처 필터로 나누거나 합치지 않음).
- 위험 판정 = (가용 + 유효 입고예정) ÷ 목표: 100% 이상 여유 / 위험 기준(기본 50%, 기준 설정에서 변경) 미만 위험 / 사이 주의 / 최근 12개월 판매 없음 · 제품일정표 단종 · = 참고. 부족 수량이 있으면 위험/주의, 없으면 여유/참고 (히어로 품목은 설정한 수량 기준 그대로).
- 대량 판매 확인: 가장 많이 팔린 달이 두 번째 달의 2배 이상(또는 판매가 한 달뿐)이면 표시. 목표에서 빼지 않음.
- 표: 품번/품명 · 상태 · 가용재고 · 부족 수량 · 최근 6개월. 나머지(근거 · 거래처별 월 판매 · 창고 · 입고예정 · 최근 판매)는 펼친 행. 품목별/거래처별 탭, 거래처 드롭다운.
- 운영 index.html 과의 비교 테스트는 발주 현황 계산 부분만 제외(품목 재고 · 판매 합계 · 입고일정 등은 계속 비교), 새 계산은 `forecast.target.test.js` 가 검증.
- 거래처 분석 · 개요는 과거 판매 기준으로만 표시 (주문 주기 예측 제거).
