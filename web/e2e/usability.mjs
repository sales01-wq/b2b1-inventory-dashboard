// 생산 필요 현황 사용성 확인 (npm run e2e:usability): 3개월/6개월 미판매 필터 · 긴 품명 줄바꿈(잘림 없음) · 선택 품목 엑셀 다운로드(여러 거래처 · 여러 품목)
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/node';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const server = await createServer({server: {port: 5178, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5178';
const LONG = '프리미엄 인텐시브 리페어 하이드레이팅 세럼 Intensive Repair Hydrating Serum Limited Edition Gift Set 대용량 리필 구성';
const sh = makeSheets(Date.now());
sh.schedule.forEach((r, i) => { if (i > 0 && r[0] === 'SB003') r[1] = LONG; });
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, acceptDownloads: true});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'}); return u.startsWith(base) ? r.continue() : r.abort(); });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByRole('button', {name: '대시보드에 적용'}).click(); await page.waitForURL(/#\/overview$/);
  await page.goto(base + '/#/forecast'); await page.getByRole('tab', {name: '품목별'}).waitFor();
  assert.equal(await page.locator('a[href="#/skugroups"]').count(), 0, '상품 그룹 관리 메뉴 없음');

  // 3개월 / 6개월 미판매 칩: 서로 다른 필터, 3개월 ≥ 6개월
  const n6 = +(await page.getByRole('button', {name: /^6개월 미판매 \d+$/}).innerText()).match(/\d+$/)[0];
  const n3 = +(await page.getByRole('button', {name: /^3개월 미판매 \d+$/}).innerText()).match(/\d+$/)[0];
  assert.ok(n3 >= n6, `3개월(${n3}) ≥ 6개월(${n6})`);
  await page.getByRole('button', {name: /^3개월 미판매 \d+$/}).click();
  await page.waitForFunction(n => document.querySelectorAll('tbody tr td.sticky-col code').length === n, n3).catch(() => {});
  const codes3 = (await page.locator('tbody tr td.sticky-col code').allInnerTexts()).length;
  assert.equal(codes3, n3, '3개월 미판매 칩 개수와 목록 일치');
  await page.getByRole('button', {name: /^6개월 미판매 \d+$/}).click();
  assert.equal((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).length, n6, '6개월 미판매 칩 개수와 목록 일치');

  // 긴 품명: 전체 표시(말줄임 없음), 줄바꿈, 행 높이 자동, 숫자 열 정렬 유지
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('checkbox', {name: '최근 6개월 판매 이력 없는 품목도 보기'}).check();
  const nameEl = page.locator('.pn-name', {hasText: LONG}).first(); await nameEl.waitFor();
  assert.equal((await nameEl.innerText()).trim(), LONG, '품명 전체 표시');
  const m = await nameEl.evaluate(el => ({over: el.scrollWidth > el.clientWidth + 1, h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) || 20, ell: getComputedStyle(el).textOverflow, ws: getComputedStyle(el).whiteSpace}));
  assert.ok(!m.over && m.ell !== 'ellipsis' && m.ws !== 'nowrap', '말줄임/가로 넘침 없음');
  assert.ok(m.h > m.lh * 1.5, '긴 품명은 여러 줄로 줄바꿈');
  const row = page.locator('tbody tr', {has: nameEl}).first();
  const rowBox = await row.boundingBox(), nameBox = await nameEl.boundingBox();
  assert.ok(nameBox.y >= rowBox.y - 1 && nameBox.y + nameBox.height <= rowBox.y + rowBox.height + 1, '품명이 행 안에 들어감(행 높이 자동)');
  const th = page.locator('thead th').nth(3), td = row.locator('td').nth(3);
  const [tb, cb] = [await th.boundingBox(), await td.boundingBox()];
  assert.ok(Math.abs(tb.x - cb.x) < 2 && Math.abs(tb.width - cb.width) < 2, '숫자 열이 머리글과 정렬');

  // 선택 품목 엑셀: 여러 품목 × 여러 거래처 (실제 .xlsx 를 내려받아 다시 읽음)
  await page.getByRole('button', {name: '거래처 전체'}).click();
  const custs = page.getByRole('checkbox'); const names = ['A상사', 'B유통'];
  for (const n of names) await page.getByRole('checkbox', {name: n, exact: true}).check();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', {name: /^SB00\d 선택$/}).first().check();
  await page.getByRole('checkbox', {name: /^SB00\d 선택$/}).nth(1).check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '선택 품목 엑셀 다운로드'}).click()]);
  const path = await dl.path(); const sheets = await readXlsxFile(path);
  assert.deepEqual(sheets.map(s => s.sheet), ['요약', '고객별 월 판매', '월별 합계(목표 근거)', '그룹 멤버 SKU', '안내']);
  const sum = sheets[0].data; assert.equal(sum.length, 3, '요약: 선택한 2개 품목');
  assert.ok(sum.slice(1).every(r => String(r[0]).includes('A상사') && String(r[0]).includes('B유통')), '선택 거래처 범위 표시');
  const pc = sheets[1].data.slice(1); assert.ok(pc.some(r => r[3] === 'A상사') && pc.some(r => r[3] === 'B유통'), '거래처별 줄');
  assert.deepEqual(errors, []);
  console.log('e2e 사용성(미판매 필터 · 품명 줄바꿈 · 엑셀 다운로드): 통과');
} finally { await browser.close(); await server.close(); }
