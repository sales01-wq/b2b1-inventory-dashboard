// 상품 그룹 관리(1 · 2단계) 확인 (npm run e2e:skugroups): 후보 검토 → 승인 · 거절, 대표 SKU 자동/수동, 재고 호환, 고객 전용(TARGET/TJX) 분리,
// 그리고 생산 필요 현황은 그대로(SKU 별 행 유지)인지 실제 Chromium 에서 확인합니다.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const server = await createServer({server: {port: 5177, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5177';
const sh = makeSheets(Date.now());
const rename = {SB004: '세트 A (북미)', SB005: '세트 A (글로벌)', SB006: '세트 A (TARGET)', MT001: '클렌저 (TARGET)', MT003: '클렌저 (TJX)', SB001: '세럼 (북미/유럽)', SB002: '세럼 (글로벌)'};
sh.schedule.forEach((r, i) => { if (i > 0 && rename[r[0]]) r[1] = rename[r[0]]; });
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByRole('button', {name: '대시보드에 적용'}).click();
  await page.waitForURL(/#\/overview$/);
  const forecastCodes = async () => {
    await page.goto(base + '/#/forecast'); await page.getByRole('tab', {name: '품목별'}).waitFor();
    await page.getByRole('button', {name: /^전체 \d+$/}).click();
    await page.getByRole('checkbox', {name: '최근 6개월 판매 이력 없는 품목도 보기'}).check(); // 판매 없는 SKU 도 보이게 (SB005 등)
    return (await page.locator('tbody tr td.sticky-col code').allInnerTexts()).sort();
  };
  const before = await forecastCodes();

  await page.goto(base + '/#/skugroups');
  await page.getByText(/확정한 그룹만 생산 필요 현황에 반영됩니다/).waitFor();
  await page.getByRole('tab', {name: /^후보 검토 2$/}).waitFor(); // 세트 A(일반) · 세럼(일반) — TARGET/TJX 는 후보에 섞이지 않음
  assert.equal(await page.locator('h3').count(), 2);
  assert.equal(await page.getByText('SB006', {exact: true}).count(), 0, 'TARGET SKU 가 일반 후보에 들어감');
  assert.equal(await page.getByText('MT003', {exact: true}).count() + await page.getByText('MT001', {exact: true}).count(), 0, 'TARGET/TJX 단독 SKU 가 후보에 나옴');
  await page.getByText('바코드 같음').first().waitFor();
  // 후보만으로는 계산에 영향 없음
  assert.deepEqual(await forecastCodes(), before);
  await page.goto(base + '/#/skugroups');

  // 승인 → 확정 그룹 · 적용 중 · 대표 SKU 자동(최근 판매실적일 기준): 판매 이력이 있는 SB004
  await page.getByRole('button', {name: '승인 (그룹 만들기)'}).first().click();
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  await page.getByText('생산 필요 현황에 적용 중').waitFor();
  await page.getByText('대표 SB004 (자동)').first().waitFor();
  await page.getByText(/최근 판매실적일 기준.*실제 출하일 아님/).first().waitFor();

  // 생산 필요 현황: 그룹은 대표 한 줄(SB005 사라짐), 그룹 없는 SKU(SB006 TARGET 등)는 그대로
  const grouped = await forecastCodes();
  assert.deepEqual(grouped, before.filter(c => c !== 'SB005'), '그룹은 한 줄로 합쳐지고 나머지는 그대로');
  const row = page.locator('tr', {has: page.getByText('SB004', {exact: true})}).first();
  await row.getByText('그룹 2', {exact: true}).waitFor(); // 그룹 표시
  assert.equal(await page.getByText('그룹 2', {exact: true}).count(), 1, '그룹 표시는 그룹 행에만');
  await row.getByRole('button', {name: '근거 보기'}).click();
  await page.getByText(/판매 이력은 그룹 전체를 합산해 계산하고, 재고 · 입고예정은 대표 SKU 와 호환 확인한 SKU 만 포함/).waitFor();
  await page.locator('tr', {has: page.getByText('미반영 (별도 표시)')}).first().waitFor();
  await page.getByText('반영 (대표)').waitFor();
  await row.getByRole('button', {name: '근거 닫기'}).click();
  // 발주 목록: 대표 SKU 로 담고 그룹 스냅샷 저장
  await page.getByRole('checkbox', {name: 'SB004 선택'}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/1개 담음/).waitFor();
  await page.goto(base + '/#/orders');
  const orow = page.locator('tbody tr', {hasText: 'SB004'});
  await orow.getByText(/담을 때 그룹: 세트 A · 대표 SB004 · SKU 2개/).waitFor();
  const qtyBefore = await orow.getByRole('spinbutton').inputValue();

  // 대표를 SB005(판매 이력 없음)로 수동 변경 → 생산 필요 현황은 SB005 한 줄, 발주 목록 기존 항목은 그대로 + 경고
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  await page.locator('tr', {has: page.getByText('SB005', {exact: true})}).getByRole('button', {name: '대표로 지정'}).click();
  await page.getByText('대표 SB005 (직접 지정)').first().waitFor();
  await page.getByText(/수동 지정한 대표 SKU 에 판매 이력이 없습니다/).waitFor();
  await page.getByText(/발주 목록에 이미 담긴 멤버가 있습니다/).waitFor();
  const afterRep = await forecastCodes();
  assert.deepEqual(afterRep, before.filter(c => c !== 'SB004'), '수동 대표가 표시 품번이 됨');
  await page.goto(base + '/#/orders');
  const orow2 = page.locator('tbody tr', {hasText: 'SB004'});
  assert.equal(await orow2.getByRole('spinbutton').inputValue(), qtyBefore, '기존 발주 수량이 바뀜');
  await orow2.getByText(/그룹의 이전 SKU 입니다 \(현재 대표 SB005\)/).waitFor();
  await orow2.getByText(/담을 때 대표 SKU\(SB004\)와 현재 대표\(SB005\)가 다릅니다/).waitFor();
  // 새 대표를 담으면 중복 경고만 (병합 · 삭제 없음)
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('checkbox', {name: 'SB005 선택'}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/같은 그룹\(세트 A\)의 다른 SKU 가 이미 발주 목록에 있습니다 — SB004/).waitFor();
  await page.goto(base + '/#/orders');
  assert.equal(await page.locator('tbody tr').count(), 2, '두 항목 모두 유지');

  // 그룹 삭제 → 개별 SKU 로 복귀, 발주 목록 항목은 그대로
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name: '그룹 삭제'}).click();
  assert.deepEqual(await forecastCodes(), before, '그룹 삭제 후 개별 SKU 로 복귀');
  await page.goto(base + '/#/orders');
  assert.equal(await page.locator('tbody tr').count(), 2);
  // 후보 거절 · 되돌리기
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^후보 검토 2$/}).click();
  await page.getByRole('button', {name: '거절'}).first().click();
  await page.getByRole('tab', {name: /^후보 검토 1$/}).waitFor();
  await page.getByRole('button', {name: '거절 모두 되돌리기'}).click();
  await page.getByRole('tab', {name: /^후보 검토 2$/}).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  console.log('e2e 상품 그룹 관리(1 · 2단계): 통과');
} finally { await browser.close(); await server.close(); }
