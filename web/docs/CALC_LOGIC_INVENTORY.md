# Calculation logic inventory — what must be tested before/while porting

Source: `index.html` at the repo root (production). Line numbers refer to the version on
branch `main` at commit `d369ec2`.

**Rule for the port:** every function below moves into `web/src/lib/` with *identical behaviour*.
The only allowed change is turning hidden global inputs (`state`, `ui`, `settings`, `Date.now()`)
into explicit parameters so the functions can be tested. A "golden" test compares the new
output to the old `index.html` output on the same ERP sample files.

Priority: **P0** = wrong value directly changes an order/shipping decision. **P1** = wrong value
changes a displayed figure or filter. **P2** = formatting / helpers.

---

## 1. Sheet parsing (ERP export → rows)

| Function | Line | P | What it does | Test cases needed |
|---|---|---|---|---|
| `findHeaderRow` | 593 | P0 | Finds the header row within the first **12** rows that contains all required columns (string or RegExp) | header on row 0 / row 11 / row 12 (must fail); regex column |
| `colIdx` | 604 | P2 | Column index by name or RegExp | missing column → -1 |
| `findMonthColumns` | 609 | P0 | Finds the first **3** `N월 입고일정` columns in file order, pairs each with the next `N월 입고수량` | Dec→Jan→Feb year wrap; only 1–2 months present; 4 months present (keeps first 3) |
| `num` | 625 | P0 | `"1,234"` → 1234; blank/NaN → 0 | commas, spaces, `null`, text |
| `parseDateStr` | 632 | P0 | `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD` (local time, no UTC day shift), `MM-DD-YYYY`, browser fallback | timezone: must not shift a day; time suffix; invalid → null |
| `parseInventory` | 657 | P0 | 가용재고조회 → rows; skips rows without 품번 or 창고 | real sample file |
| `parseSchedule` | 683 | P0 | 제품일정표 → rows with up to 3 months of incoming (`aug/sep/oct_*` are slot names, not real months); sets `monthLabels` | real sample; fewer than 3 months → `'-'` labels |
| `parseSales` | 716 | P0 | 일자별판매실적분석 → rows; skips `TOTAL` and rows with unparseable dates | real sample; TOTAL row |
| `parseExpiry` | 742 | P0 | 유통기한 → LOT rows | real sample; blank expiry date |
| `parseProductMaster` | 767 | P0 | 상품마스터 → box / inner / product dimensions + PLT data | real sample |
| `detectSheetType` + `SHEET_SIGNATURES` | 3534, 582 | P0 | Auto-detects which of the 5 sheet types a file is | each sample file → correct key; unknown file → null |
| `teamFromName` / `teamFromRows` | 826–827 | P0 | Sales file team: file name (`B2B1팀`) → else majority of `부서` column in first 300 rows → else `B2B1팀` | name wins over column; no column |
| `applyUploadedData` (logic part) | 3612 | P0 | Required-sheet check, reuse of previously loaded sheets, per-team sales merge | missing required sheet; partial re-upload keeps old data |

## 2. Core forecast / grading (발주 현황, 전체 개요)

| Function | Line | P | What it does | Test cases needed |
|---|---|---|---|---|
| `brandOf` | 803 | P0 | 품번 prefix SB/MT/MC → brand; **anything else is dropped from all screens** | lower-case prefix; other prefix → null |
| `isUsableWarehouse` / `teamWarehouseTokens` | 819–822 | P0 | Which warehouses count as usable stock for the selected team (team + EMP; 전체 = both teams + EMP) | each team setting |
| `usableAvailable` / `scopedAvailable` | 843, 848 | P0 | Sum of usable 가용재고; overstock scope `all` / `b2b1` (team-own) / `emp` | each scope |
| `RULE_DEFAULTS` / `ruleThresholds` / `getRules` | 864–867 | P0 | leadDays 60, urgentDays 30, cautionExtra 30, safeExtra 60, minOrders 2, dormantMonths 6; shared overrides | default + overridden rules |
| `gradeFor` | 916 | **P0** | Grade from days of cover: 긴급 / 위험 / 주의 / 관찰 / 안전 / 안전(입고예정) / 단발성 / 휴면 / 데이터부족; hero items use quantity thresholds instead | **every branch**; boundary values exactly at each threshold; hero min/warn; dormant cut-off; orderCount < minOrders |
| `orderEntry` | 952 | **P0** | Per-customer pattern: order count, avg qty/order, avg cycle days, quarterly-equivalent demand (1 order or same-day orders → `total × 91.25/365`) | 1 order; same-day orders; regular cycle |
| `nextOrderOf` | 969 | **P0** | Next expected order = last + cycle; overdue more than max(cycle, 45 days) → customer considered stopped | on time; slightly overdue; stopped |
| `windowDemand` | 976 | **P0** | Demand expected inside a W-day window from the cycle (cap 400 steps) | W = 91.25 and W = leadDays |
| `computeOrderPattern` | 984 | **P0** | Last-12-months sales per customer → totalQuarterly, horizon, lead, next order | multi-customer product |
| `canonCust` + `CUSTOMER_ALIASES` | 1011–1014 | P1 | Merges UNLOCKT / 언락드 spellings into one customer. **Note: mutates `state.sales` in place** | both spellings |
| `computeDerived` | 1019 | **P0** | Builds all maps, the forecast list (order qty = max(0, round(horizon − available − incoming))), grade bump-up rules (lead demand > stock → 위험; horizon > stock → 주의), sort order, hero alerts | **golden test on full sample data**: entire `forecast` array must match |
| `groupOf` | 1138 | P1 | 9 internal grades → 4 display groups (위험/주의/여유/참고) | each grade |
| `salesDetailFor` | 855 | P1 | Last 6 months of sales for a product | cut-off date |
| `quarterLabel` | 799 | P1 | `2026 Q3` | month boundaries |

## 3. Sales screens (판매 현황)

| Function | Line | P | What it does | Test cases needed |
|---|---|---|---|---|
| `buildPivotRows` | 1732 | P1 | Customer × quarter pivot; groups by 품번+거래처 when more than 1 customer is selected | 0 / 1 / 2+ customers selected; brand + item-number filters |
| `custAdjust` | 1862 | P0 | Re-grades each item using one customer's own demand | golden |
| `buildCustShort` / `custShortSummary` | 1876, 1910 | P0 | Per-customer shortage summary (urgent/danger/caution counts, short qty), sorted | golden |
| `buildSkuStatusData` / `getAllSalesMonths` | 1546, 1534 | P1 | Per-item monthly sales/stock view | golden |

## 4. Lookup, shipping list and pallets (바코드 · 거래처 조회)

| Function | Line | P | What it does | Test cases needed |
|---|---|---|---|---|
| `baseBarcode` / `suffixNum` | 1927, 1930 | P0 | `880123-2` → base `880123`, suffix 2 | no suffix |
| `resolveBarcode` | 1939 | **P0** | Barcode (or exact 품번) → product; picks the **highest suffix**; customer narrows the pool only if it matches something; returns alternatives | barcode; 품번 input; customer filter with/without hit; not found |
| `resolveNameMatches` | 1977 | P1 | Product-name search, de-duplicated by 품번 | partial name; customer filter |
| `pickRecommendedLot` | 2470 | **P0** | LOT choice: (1) ≥2 years left **and** covers needed qty, earliest expiry first; (2) covers needed qty, longest expiry; (3) ≥2 years left else longest expiry | each priority path; no LOTs; missing expiry date |
| `autoSelectRecommendedFor` | 2497 | P0 | Recommends the usable warehouse with most stock + recommended LOT | golden |
| `boxInfoFor` | 2181 | P0 | Manually entered box info overrides product master field by field | manual partial override |
| `computePltForRow` | 2609 | **P0** | Boxes per layer (tries both orientations), layers = floor(H / boxH), boxes needed = ceil(qty / per-box), pallets needed, remainder units | rotation case; no 아웃입수; box taller than pallet |
| `buildExportRows` | 2639 | **P0** | Shipping list: allocates needed qty across warehouses **by priority**, computes diff, clones rows per selected LOT, adds synthetic rows for incoming/expiry-only items | priority allocation; shortage; multiple LOTs |
| `packPalletsMixed` | 2856 | **P0** | Mixed-pallet packing: full pallets first, then fragments by First-Fit-Decreasing; weight = boxes × box weight + tare; height = sum of layers per item | known small cases with hand-checked answers |
| `calcExportPlt` | 2898 | **P0** | Per-item vs mixed mode, usable height = pallet H − base thickness, per-pallet weight, actual boxes/height per pallet. **Reads DOM inputs directly → must become parameters** | defaults (110×110×150, base 15, tare 20); mixed vs separate |
| `downloadExportCsv` / `downloadForecastCsv` / `downloadForecastListCsv` / `downloadSkuStatusCsv` | 2984, 1382, 1374, 1646 | P0 | CSV exports used outside the dashboard | **byte-for-byte compare** with old output (column order, BOM, number format) |

## 5. Settings and data loading (logic parts)

| Function | Line | P | Notes |
|---|---|---|---|
| `loadRemoteSettings` → `settings.rules/hero/box` | 895 | P0 | Item kinds `rules:main`, `hero:<품번>`, `box:<품번>` — format must stay identical (shared with production via Apps Script) |
| `persistSetting` | 885 | P0 | POST `/api/settings` `{kind,key,value}`; `null` deletes |
| `loadSharedData` / `fetchBundle` | 3846, 3875 | P0 | 204 = unchanged, 409 = no snapshot → chunked `rows` fallback (1,000 rows, 4 workers) |
| `localStorage` keys | — | P0 | `inv_team`, `inv_settings_v1`, the token key — keep the same names so users keep their state |

---

## Testability issues found (to fix during the port, without changing results)

1. **Hidden clock.** `gradeFor`, `nextOrderOf`, `windowDemand`, `computeOrderPattern`, `computeDerived`,
   `custAdjust`, `pickRecommendedLot`, `salesDetailFor` all call `new Date()` / `Date.now()`.
   → Pass `now` as a parameter; golden tests run with a fixed date.
2. **Hidden globals.** Most functions read `state`, `ui` (team, brand filter, needed qty, manual box info)
   and `settings`. → Pass them as arguments.
3. **DOM reads inside calculations.** `calcExportPlt` reads pallet size inputs from the page;
   `computeDerived` touches `#forecastCustomer`. → Split into a pure calculation + a UI layer.
4. **In-place mutation.** `computeDerived` rewrites `state.sales[].거래처` via `canonCust`. Keep the
   behaviour but do it once when the data loads.
5. **Floating-point tolerances** (`1e-9`, `1e-6`) in `packPalletsMixed` must be kept as-is.

## What the ERP sample files must contain for good coverage

- All 5 sheet types: 가용재고조회, 제품일정표, 일자별판매실적분석 (B2B1팀 and B2B2팀 if possible), 유통기한, 상품마스터.
- Items from all 3 brands (SB / MT / MC) plus a few other prefixes (to check they are dropped).
- Warehouses for B2B1팀, B2B2팀 and EMP.
- Products with a single order, regular repeat orders, and no orders for 6+ months.
- Barcodes with `-1`, `-2` suffixes (alternatives), and LOTs with less than / more than 2 years of shelf life.
- Anonymizing customer names is fine as long as the same customer keeps the same replacement name.
