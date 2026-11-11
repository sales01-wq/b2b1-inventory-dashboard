// 브라우저 확인 (npm run e2e): 테스트용 ERP 시트 6개를 업로드 화면에 올리고 → 적용 → 개요 이동 →
// 머리글 요약 숫자 → 팀 전환까지 실제 Chromium 에서 확인합니다. 숫자는 운영 대시보드와 비교 테스트로 맞춘 값입니다.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright'); // 이 환경에 설치된 Playwright 사용
const server = await createServer({server: {port: 5174, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5174';
const sh = makeSheets(Date.now());
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // CDN 대신 같은 버전의 PapaParse 를 node_modules 에서 제공 (오프라인에서도 동작)
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByText('인식됨: 상품마스터').waitFor();
  assert.equal(await page.getByText(/^인식됨: /).count(), 6);
  await page.getByRole('button', {name: '대시보드에 적용'}).click();
  await page.waitForURL(/#\/overview$/);
  assert.match(await page.getByText(/^\[B2B1팀\] 품목/).textContent(), /^\[B2B1팀\] 품목 11개 · 거래처 4곳 · 판매실적 30건 · 마지막 업로드 /);
  // 전체 개요: 운영 대시보드가 같은 데이터로 그리는 값 (views.test.js 에서 비교 확인된 숫자)
  const main = (await page.getByRole('main').innerText()).replace(/\s+/g, ' ');
  for (const re of [/품목 11개/, /위험 20% 1 /, /주의 20% 1 /, /여유 60% 3 /, /위험 1 주의 1 여유 3 참고 \(휴면·단발성\) 6 거래처 수 4 최근 6개월 총판매 7,080/])
    assert.match(main, re);
  if (process.env.SHOT_DIR) await page.screenshot({path: process.env.SHOT_DIR + '/overview.png', fullPage: true}); // 선택: 화면 캡처 저장 위치
  await page.getByRole('radio', {name: '전체'}).click();
  assert.match(await page.getByText(/^\[전체\] 품목/).textContent(), /^\[전체\] 품목 11개 · 거래처 5곳 · 판매실적 35건 · /);
  await page.goto(base + '/#/data');
  assert.equal(await page.getByText(/^업데이트 완료/).textContent(), '업데이트 완료 — 새로 반영: 가용재고조회, 제품일정표, 일자별판매실적분석, 유통기한, 상품마스터. 좌측 메뉴에서 Main을 확인하세요.');
  assert.deepEqual(errors, []);
  console.log('e2e 업로드: 통과');
} finally {
  await browser.close();
  await server.close();
}
