// 상품 그룹 관리(1단계) 확인 (npm run e2e:skugroups): 후보 검토 → 승인 · 거절, 대표 SKU 자동/수동, 재고 호환, 고객 전용(TARGET/TJX) 분리,
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
    return (await page.locator('tbody tr td.sticky-col code').allInnerTexts()).sort();
  };
  const before = await forecastCodes();

  await page.goto(base + '/#/skugroups');
  await page.getByText(/생산 필요 현황의 계산.*아직 반영되지 않습니다/).waitFor();
  await page.getByRole('tab', {name: /^후보 검토 2$/}).waitFor(); // 세트 A(일반) · 세럼(일반) — TARGET/TJX 는 후보에 섞이지 않음
  const cards = page.locator('h3');
  assert.equal(await cards.count(), 2);
  assert.equal(await page.getByText('SB006', {exact: true}).count(), 0, 'TARGET SKU 가 일반 후보에 들어감');
  assert.equal(await page.getByText('MT003', {exact: true}).count() + await page.getByText('MT001', {exact: true}).count(), 0, 'TARGET/TJX 단독 SKU 가 후보에 나옴');
  await page.getByText('바코드 같음').first().waitFor();

  // 승인 → 확정 그룹, 대표 SKU 자동(최근 판매실적일 기준): 판매 이력이 있는 SB004
  await page.getByRole('button', {name: '승인 (그룹 만들기)'}).first().click();
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).waitFor();
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  await page.getByText('대표 SB004 (자동)').waitFor();
  await page.getByText(/최근 판매실적일 기준.*실제 출하일 아님/).first().waitFor();
  // 수동 대표: 판매 이력 없는 SB005 → 경고, 호환 확인은 기본 꺼짐 · 켜면 '호환 확인됨'
  await page.locator('tr', {has: page.getByText('SB005', {exact: true})}).getByRole('button', {name: '대표로 지정'}).click();
  await page.getByText('대표 SB005 (직접 지정)').waitFor();
  await page.getByText(/수동 지정한 대표 SKU 에 판매 이력이 없습니다/).waitFor();
  await page.getByText(/자동 제안\(SB004\)/).waitFor();
  const compat = page.getByRole('checkbox', {name: 'SB004 재고 호환 확인'});
  assert.equal(await compat.isChecked(), false);
  await page.getByText(/이전 SKU 재고 \(대표 SKU 와 따로 표시\): SB004 가용 60/).waitFor();
  await compat.check();
  await page.getByText(/\(호환 확인됨\)/).waitFor();
  // 고객 전용 SKU 는 섞을 수 없음
  await page.getByPlaceholder('품번 입력 후 추가').fill('SB006');
  await page.getByRole('button', {name: '멤버 추가'}).click();
  await page.getByText(/고객 전용 SKU 는 서로 · 일반 SKU 와 묶을 수 없습니다/).waitFor();
  // 직접 만들기: TARGET + TJX 거절, 같은 종류끼리 불가(1개)
  await page.getByLabel(/품번 \(줄 · 쉼표/).fill('MT001 MT003');
  await page.getByLabel('그룹 이름').first().fill('테스트');
  await page.getByRole('button', {name: '그룹 만들기'}).click();
  await page.getByText(/고객 전용 SKU 는 서로/).first().waitFor();
  // 자동으로 되돌리기
  await page.getByRole('button', {name: '대표 SKU 자동으로 되돌리기'}).click();
  await page.getByText('대표 SB004 (자동)').waitFor();

  // 계산에는 영향 없음: 생산 필요 현황은 SKU 별 행 그대로
  assert.deepEqual(await forecastCodes(), before, '1단계에서 생산 필요 현황 행이 바뀜');

  // 그룹 삭제 → 후보로 복귀, 후보 거절 → 사라짐 → 거절 되돌리기
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name: '그룹 삭제'}).click();
  await page.getByRole('tab', {name: /^후보 검토 2$/}).click();
  await page.getByRole('button', {name: '거절'}).first().click();
  await page.getByRole('tab', {name: /^후보 검토 1$/}).waitFor();
  await page.getByRole('button', {name: '거절 모두 되돌리기'}).click();
  await page.getByRole('tab', {name: /^후보 검토 2$/}).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  console.log('e2e 상품 그룹 관리(1단계): 통과');
} finally { await browser.close(); await server.close(); }
