// 상품 그룹 관리 확인 (npm run e2e:skugroups): 자동 그룹(승인 없이) · 이름만 같은 후보는 수동 검토 · TARGET 분리 · 고객별 대표 SKU ·
// 선택 필요(고객마다 다름) 담기 차단/직접 선택 · 자동 그룹 제외/수동 전환 · 발주 목록 보존 · SKU 충돌 경고를 실제 Chromium 에서 확인합니다.
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
sh.schedule.forEach((r, i) => { if (i > 0 && rename[r[0]]) r[1] = rename[r[0]]; if (i > 0 && r[0] === 'SB006') r[3] = '8800000000200'; }); // TARGET 은 자체 바코드
// 최근 판매: A상사 는 SB004, B유통 은 SB005 를 가장 최근에 판매 (고객마다 다름)
const ymd = d => { const t = new Date(Date.now() - d * 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
sh.sales1.push(['판매', 'S901', ymd(20), 'B2B1팀', 'A상사', '세트 A (북미)', 'SB004', '40', '1,000'], ['판매', 'S902', ymd(10), 'B2B1팀', 'B유통', '세트 A (글로벌)', 'SB005', '30', '1,000']);
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
async function open(initScript) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (initScript) await page.addInitScript(initScript);
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByRole('button', {name: '대시보드에 적용'}).click();
  await page.waitForURL(/#\/overview$/);
  return {page, errors};
}
const listCodes = async page => {
  await page.goto(base + '/#/forecast'); await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('checkbox', {name: '최근 6개월 판매 이력 없는 품목도 보기'}).check();
  return (await page.locator('tbody tr td.sticky-col code').allInnerTexts()).sort();
};
const pickCustomers = async (page, names) => {
  await page.getByRole('button', {name: /^거래처 (전체|\d+곳 선택)$/}).click();
  for (const n of names) await page.getByRole('checkbox', {name: n, exact: true}).check();
  await page.keyboard.press('Escape');
};
try {
  const {page, errors} = await open();
  // 승인 없이 자동 그룹: SB004+SB005 (같은 바코드 · 지역 표기만 다름). TARGET(SB006)은 별개, 이름만 같은 세럼(SB001/SB002)은 후보로 남음
  const codes = await listCodes(page);
  assert.equal(codes.includes('SB004') !== codes.includes('SB005'), true, '자동 그룹: SB004 · SB005 는 한 줄에 합쳐짐'); // 대표가 고객마다 달라 선택 필요 — 임시로 전체 기준 최근 판매 SKU 를 표시
  const tentative = codes.includes('SB005') ? 'SB005' : 'SB004';
  assert.ok(codes.includes('SB006') && codes.includes('SB001') && codes.includes('SB002'), 'TARGET · 이름만 같은 SKU 는 개별 그대로');
  await page.getByText('자동 그룹 2', {exact: true}).waitFor();
  assert.equal(await page.getByText(/자동 그룹 \d/).count(), 1);

  await page.goto(base + '/#/skugroups');
  await page.getByText(/바코드\(또는 마스터 규격\)가 일치하는 SKU 는 승인 없이 자동 그룹/).waitFor();
  await page.getByRole('tab', {name: /^후보 검토 1$/}).waitFor(); // 세럼(이름만 일치)만 수동 검토
  await page.getByRole('tab', {name: /^자동 그룹 1$/}).click();
  await page.getByRole('heading', {name: '세트 A'}).waitFor();
  await page.getByText('자동 그룹', {exact: true}).first().waitFor();
  await page.getByText('생산 필요 현황에 적용 중').waitFor();
  await page.getByText(/고객별 대표 SKU/).waitFor();
  await page.getByText('고객마다 대표 SKU 가 다름 (담기 전 선택)').waitFor(); // A상사=SB004, B유통=SB005
  await page.getByRole('cell', {name: 'A상사'}).waitFor(); await page.getByRole('cell', {name: 'B유통'}).waitFor();

  // 생산 필요 현황: 전체 고객은 선택 필요 → 일괄 담기 차단, 고객 1곳 선택하면 그 고객의 SKU
  await page.goto(base + '/#/forecast'); await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByText('SKU 선택 필요', {exact: true}).waitFor();
  await page.getByRole('checkbox', {name: new RegExp(`^${tentative} 선택$`)}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/0개 담음.*1개 그룹은 고객마다 SKU 가 달라 건너뜀/).waitFor();
  await page.getByRole('button', {name: '선택 해제'}).click();
  await pickCustomers(page, ['B유통']);
  await page.getByText('거래처 1곳 선택').waitFor();
  assert.equal(await page.getByText('SKU 선택 필요', {exact: true}).count(), 0, '고객 1곳이면 확정');
  assert.ok((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).includes('SB005'), 'B유통 의 최근 판매 SKU = SB005');
  await page.getByRole('button', {name: '모두 해제'}).first().click();
  await pickCustomers(page, ['A상사']);
  await page.getByText('거래처 1곳 선택').waitFor();
  assert.ok((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).includes('SB004'), 'A상사 의 최근 판매 SKU = SB004');
  await page.getByRole('button', {name: '모두 해제'}).first().click();
  // 선택 필요 그룹: 행을 펼쳐 SKU 를 직접 고르면 담김
  await page.locator('tr', {has: page.getByText('SKU 선택 필요', {exact: true})}).getByRole('button', {name: '근거 보기'}).click();
  await page.getByText(/SKU 선택 필요: 고객마다 최근에 판 SKU 가 달라/).waitFor();
  const sel = page.getByRole('combobox', {name: '발주할 SKU 선택'}).or(page.getByLabel('발주할 SKU 선택')).first();
  await sel.click(); await page.getByRole('option', {name: /^SB005/}).click();
  await page.getByRole('button', {name: '선택한 SKU 로 발주 목록에 담기'}).click();
  await page.getByText(/SB005 를 담았습니다/).waitFor();
  await page.goto(base + '/#/orders');
  const orow = page.locator('tbody tr', {hasText: 'SB005'});
  await orow.getByText(/담을 때 그룹: 세트 A · 대표 SB005 · SKU 2개/).waitFor();
  const qty = await orow.getByRole('spinbutton').inputValue();

  // 자동 그룹 → 수동 그룹으로 전환(수정): 대표 직접 지정 (고객과 무관), 기존 발주 항목 그대로
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^자동 그룹 1$/}).click();
  await page.getByRole('button', {name: '수동 그룹으로 전환(수정)'}).click();
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).waitFor(); await page.getByText('수동 그룹', {exact: true}).first().waitFor();
  await page.getByRole('tab', {name: /^자동 그룹 0$/}).waitFor();
  await page.locator('tr', {has: page.getByText('SB004', {exact: true})}).getByRole('button', {name: '대표로 지정'}).click();
  await page.getByText('대표 SB004 (직접 지정)').first().waitFor();
  await page.goto(base + '/#/forecast'); await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  assert.equal(await page.getByText('SKU 선택 필요', {exact: true}).count(), 0, '수동 대표는 고객과 무관하게 우선');
  await page.goto(base + '/#/orders');
  assert.equal(await page.locator('tbody tr', {hasText: 'SB005'}).getByRole('spinbutton').inputValue(), qty, '기존 발주 수량 유지');
  await page.locator('tbody tr', {hasText: 'SB005'}).getByText(/담을 때 대표 SKU\(SB005\)와 현재 대표\(SB004\)가 다릅니다/).waitFor();

  // 수동 그룹 삭제 → 자동 그룹이 다시 생김 → 자동 그룹 제외 → 개별 SKU (거절은 다시 제안되지 않음)
  await page.goto(base + '/#/skugroups');
  await page.getByRole('tab', {name: /^확정 그룹 1$/}).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name: '그룹 삭제'}).click();
  await page.getByRole('tab', {name: /^자동 그룹 1$/}).click();
  await page.getByRole('button', {name: '자동 그룹 제외'}).click();
  await page.getByRole('tab', {name: /^자동 그룹 0$/}).waitFor();
  const after = await listCodes(page);
  assert.ok(after.includes('SB004') && after.includes('SB005'), '제외하면 개별 SKU 로 계산');
  await page.goto(base + '/#/orders');
  assert.equal(await page.locator('tbody tr').count(), 1, '발주 목록 항목 유지');
  assert.deepEqual(errors, []);
  await page.close();

  // SKU 충돌(겹치는 확정 그룹, 예: 서버에서 불러온 설정): 관련 그룹은 적용되지 않고 개별 SKU 로 보이며 경고가 나옴
  const c = await open(() => localStorage.setItem('inv_settings_v1', JSON.stringify({rules: {}, hero: {}, box: {}, mask: {}, skuRejected: [], skuGroups: {
    g1: {name: '세트 A 1', members: ['SB004', 'SB005'], rep: null, compat: []}, g2: {name: '세트 A 2', members: ['SB005', 'SB006'], rep: null, compat: []}, g3: {name: '세럼', members: ['SB001', 'SB002'], rep: null, compat: []}}})));
  const cp = c.page;
  await cp.goto(base + '/#/skugroups');
  await cp.getByText(/SKU 그룹 충돌 1건/).waitFor();
  await cp.getByText(/SB005.*'세트 A 1', '세트 A 2' 2개 그룹에 속해 있습니다/).waitFor();
  await cp.getByRole('tab', {name: /^확정 그룹 3$/}).click();
  assert.equal(await cp.getByText('적용 안 됨', {exact: true}).count(), 2, '충돌 그룹 2개만 적용 안 됨');
  const cc = await listCodes(cp);
  for (const pn of ['SB004', 'SB005', 'SB006']) assert.ok(cc.includes(pn), pn + ' 가 개별 SKU 로 보이지 않음');
  assert.equal(await cp.getByText(/^그룹 2$/).count(), 1, '충돌 없는 그룹(세럼)만 그룹 표시');
  assert.deepEqual(c.errors, []);
  await cp.close();
  console.log('e2e 상품 그룹 관리(자동 그룹 · 고객별 대표 SKU): 통과');
} finally { await browser.close(); await server.close(); }
