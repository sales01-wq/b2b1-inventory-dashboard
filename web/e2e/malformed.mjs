// 이상값 확인 (npm run e2e:malformed): 마이너스 재고 · 빈 칸 · 숫자 아닌 수량 · 잘못된 입고 날짜 · 거래처 없는 판매가 섞인 시트를 올려도
// 생산 필요 현황(품목별 · 거래처별 · 펼친 행 · 기준 설정)과 다른 화면이 "문제가 생겼습니다" 없이 열리는지 확인합니다.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const {chromium} = createRequire(import.meta.url)('playwright');
const server = await createServer({server: {port: 5175, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5175';
const sh = makeSheets(Date.now());
const col = (rows, name) => rows.find(r => r.includes(name)).indexOf(name);
const head = (rows, name) => rows.findIndex(r => r.includes(name));
// 가용재고: 마이너스 · 빈 칸 · 글자
const ic = col(sh.inventory, '가용재고'), ih = head(sh.inventory, '가용재고');
sh.inventory.forEach((r, i) => { if (i > ih) r[ic] = ['-40', '', 'N/A', '-1,500', '12'][i % 5]; });
// 제품일정표: 잘못된 날짜 · 마이너스/글자 수량 · 빈 품목상태
const sh2 = sh.schedule, sc = sh2[0].indexOf('12월 입고일정');
sh2.forEach((r, i) => { if (i > 0 && i % 2) { r[sc] = '날짜아님'; r[sc + 1] = i % 3 ? '-5' : 'abc'; r[4] = ''; } });
// 판매실적: 거래처 없음 · 수량 글자 · 마이너스(반품)
for (const s of [sh.sales1, sh.sales2]) {
  const cc = col(s, '거래처'), qc = col(s, '수량'), hh = head(s, '수량');
  s.forEach((r, i) => { if (i > hh) { if (i % 4 === 0) r[cc] = ''; if (i % 5 === 0) r[qc] = 'x'; if (i % 6 === 0) r[qc] = '-30'; } });
}
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('papaparse.min.js')) return r.fulfill({path: createRequire(import.meta.url).resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByRole('button', {name: '대시보드에 적용'}).click();
  await page.waitForURL(/#\/overview$/);
  const noCrash = async where => assert.equal(await page.getByText('문제가 생겼습니다').count() + await page.getByText('표시하지 못했습니다').count(), 0, where + ': 오류 안내가 보임');
  for (const v of ['overview', 'forecast', 'customer', 'customers', 'health', 'orders', 'lookup']) {
    await page.goto(base + '/#/' + v);
    await page.waitForTimeout(500);
    await noCrash(v);
  }
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByText('기준 설정 (고급) · 히어로 품목').click(); // 기준 설정(분포 계산 포함)
  await page.getByText(/현재 품목 분포/).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  const closed = page.getByRole('button', {name: '근거 보기', exact: true});
  for (let i = 0; i < 50 && (await closed.count()) > 0; i++) await closed.first().click(); // 모든 행 펼치기
  await noCrash('펼친 행');
  await page.getByRole('tab', {name: '거래처별'}).click();
  await page.getByRole('columnheader', {name: '부족 품목'}).waitFor();
  await noCrash('거래처별');
  assert.deepEqual(errors, []);
  console.log('e2e 이상값 데이터: 통과');
} finally { await browser.close(); await server.close(); }
