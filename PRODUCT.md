# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

B2B sales and ordering staff of the B2B1 and B2B2 teams, and their team leads, use it about equally. Staff use it at an office PC every working day to check stock and sales, decide what to reorder and when, and prepare shipments against customer purchase orders (domestic and overseas, e.g. UNLOCKT BRANDS INC). Leads scan the same screens for at-risk items and customer sales trends. Phone use is occasional, to check a customer or an item away from the desk.

## Product Purpose

An internal inventory and sales dashboard for three cosmetics brands (성분에디터, 밀크터치, 마미케어). It turns six ERP exports into reorder decisions and shipment preparation. Success: no stock-outs on items customers keep ordering, and orders placed early enough for the production lead time.

## Positioning

- Reorder demand is forecast from each customer's own order rhythm (last order date + average order interval → demand expected in the next 3 months), not from a flat sales average, so lumpy customers who buy big and pause are handled.
- Hero items (high-volume SKUs) are judged by stock quantity thresholds instead of days of cover, with an alarm.
- A purchase order's barcodes or product names resolve to item codes, warehouse stock, LOTs and expiry, then to an export list and a pallet (PLT) count.
- Uploading the ERP sheets (or the Google Sheets sync) produces the analysis immediately.

## Operating Context

- Inputs: 가용재고 (available stock by warehouse), 제품일정표 (incoming schedule), 일자별판매실적 per team, 유통기한 (LOT/expiry), 상품마스터 (box and pallet dimensions). Excel or CSV, or a shared Google Sheet via Apps Script; shared login mode on Vercel with Google sign-in for the company domain.
- Teams: B2B1팀, B2B2팀, 전체; EMP warehouse stock counts for both teams.
- Grades: 긴급 / 위험 / 주의 / 관찰 / 안전(입고예정) / 안전, plus 휴면, 단발성, 데이터부족; shown as four groups 위험 · 주의 · 여유 · 참고. Thresholds are editable rules (lead time 60 days by default).
- Screens: 전체 개요, 발주 현황, 판매 현황 (거래처별 quarterly pivot, 품목별 monthly), 바코드 · 거래처 조회, CSV / 엑셀 업로드.

## Capabilities and Constraints

- Every calculation, filter, and interaction of the production dashboard (root index.html) must be preserved exactly; the React + Astryx app in web/ is a migration verified by comparison tests against production.
- Korean interface. Astryx is the component system.
- Horizontal progress bars for the signal shares are a confirmed owner preference.
- Distinguish missing data ('-') from real zero; never sum stock across different products; mark the current month or quarter as incomplete.

## Brand Commitments

Internal tool; no company logo or colour rules. The three brand identification colours (dots) are kept. Owner wants a premium, distinctive B2B SaaS application, not a generic admin dashboard; Linear and Vercel are quality references, not templates.

## Evidence on Hand

Synthetic test sheets in web/src/lib/__fixtures__/sheets.js (11 items, 4–5 customers). Real ERP samples are not yet provided; do not invent customer names, volumes, or claims beyond the fixtures.

## Product Principles

1. The next action comes first: what to order, how much, by when.
2. Numbers are exact and traceable to the rule that produced them.
3. Dense but calm: daily users scan many items quickly.
4. Never change a business rule for the sake of a visual.

## Accessibility & Inclusion

Text contrast at least 4.5:1; status never conveyed by colour alone; keyboard-reachable controls.
