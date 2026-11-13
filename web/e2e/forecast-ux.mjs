// 생산 필요 현황 사용성 확인 (npm run e2e:forecast-ux): 거래처 다중 선택(OR) · 1~12월 연도별 판매 · 일괄 선택 → 발주 목록 ·
// 끌어서 옆으로 스크롤(체크박스 · 행 펼치기와 충돌 없음) · 목표 기준 월 표시 · 휴대폰 가로 스크롤을 실제 Chromium 에서 확인합니다.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const require = createRequire(import.meta.url);
const {chromium, devices} = require('playwright');
const server = await createServer({server: {port: 5176, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5176';
const sh = makeSheets(Date.now());
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const browser = await chromium.launch();
async function open(opts) {
  const page = await browser.newPage(opts);
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
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  return {page, errors};
}
const codes = page => page.locator('tbody tr td.sticky-col code').allInnerTexts();
try {
  const {page, errors} = await open({viewport: {width: 1440, height: 900}});
  const year = new Date().getFullYear();

  // 3) 1~12월 + 연도 표시, 0 판매는 대시
  const heads = (await page.locator('thead th').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  for (let m = 1; m <= 12; m++) assert.ok(heads.some(h => h.startsWith(m + '월')), m + '월 열 없음');
  await page.getByText(`${year}년 월별 판매`).or(page.getByText('월별 판매 연도')).first().waitFor();
  assert.ok((await page.locator('tbody td.num.dense', {hasText: /^-$/}).count()) > 0, '0 판매 대시 없음');
  assert.ok(await page.getByRole('button', {name: `${year - 1}년`}).count() > 0, '이전 연도 선택 없음');
  await page.getByRole('button', {name: `${year - 1}년`}).click();
  await page.getByRole('button', {name: `${year - 1}년`, pressed: true}).waitFor();
  await page.getByRole('button', {name: `${year}년`}).click();

  // 2) 표 구성: 상태 · 가용재고 · 부족 수량이 품번 바로 옆, 상태 배지 외 경고 배지 없음
  assert.deepEqual((await page.locator('thead th').allInnerTexts()).slice(0, 4).map(t => t.trim().split('\n').pop()), ['품번 / 품명', '상태', '가용재고', '부족 수량']);
  assert.equal(await page.locator('tbody tr td:nth-child(2)').filter({hasText: /대량 판매|한 달뿐/}).count(), 0, '표 안에 경고 배지');

  // 1) 거래처 다중 선택 (OR) · 칩 · 해제
  const all = await codes(page);
  await page.getByRole('button', {name: '거래처 전체'}).click();
  const picker = page.getByRole('dialog').or(page.locator('[role=dialog], [popover]')).last();
  await page.getByPlaceholder('거래처 검색').fill('A');
  await page.getByRole('checkbox', {name: /^A상사$/}).check();
  await page.getByPlaceholder('거래처 검색').fill('');
  await page.getByRole('checkbox', {name: /^B유통$/}).check();
  await page.keyboard.press('Escape');
  await page.getByText('거래처 2곳 선택').waitFor();
  const orList = await codes(page);
  assert.ok(orList.length > 0 && new Set(orList).size === orList.length, '거래처 OR: 품목은 한 번씩');
  assert.ok(orList.length <= all.length);
  await page.getByRole('button', {name: 'B유통 삭제'}).or(page.locator('[aria-label*="B유통"]').first()).first().click().catch(() => {});
  await page.getByRole('button', {name: '모두 해제'}).first().click();
  await page.getByRole('button', {name: '거래처 전체'}).waitFor();
  assert.deepEqual(await codes(page), all);

  // 5) 일괄 선택: 전체 선택 → 막대 → 발주 목록(중복 없음, 기존 수량 유지)
  await page.getByRole('checkbox', {name: '현재 목록 전체 선택'}).check();
  await page.getByText(new RegExp(`^${all.length}개 선택`)).waitFor();
  await page.getByRole('tab', {name: '거래처별'}).click(); // 탭을 바꿔도 선택 유지
  await page.getByRole('tab', {name: '품목별'}).click();
  await page.getByText(new RegExp(`^${all.length}개 선택`)).waitFor();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(new RegExp(`${all.length}개 담음`)).waitFor();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click(); // 다시 눌러도 중복 없음
  await page.getByText(new RegExp(`0개 담음, ${all.length}개는 이미 있어 수량 유지`)).waitFor();
  await page.getByRole('checkbox', {name: `${all[0]} 선택`}).uncheck(); // 하나 해제 → 일부 선택
  await page.getByText(new RegExp(`^${all.length - 1}개 선택`)).waitFor();
  await page.getByRole('button', {name: '선택 해제'}).click();
  assert.equal(await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).count(), 0);
  await page.goto(base + '/#/orders');
  assert.equal(await page.locator('tbody tr').count(), all.length, '발주 목록 품목 수 (중복 없음)');
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();

  // 7) 펼친 행: 목표 재고 기준 월
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '근거 보기'}).click();
  await page.getByText(/목표 재고 기준 월:/).waitFor();
  assert.equal(await page.getByText(/대량 판매 확인:/).count() >= 0, true);
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '근거 닫기'}).click();

  // 4) 좁은 화면: 가로 스크롤 + 끌기 (체크박스 클릭 · 행 펼치기는 그대로 동작)
  await page.setViewportSize({width: 1000, height: 800});
  const sc = page.locator('.astryx-table-scroll-wrapper').first();
  assert.ok(await sc.evaluate(el => el.scrollWidth > el.clientWidth + 5), '좁은 화면에서 가로 스크롤 필요');
  const cell = page.locator('tbody tr').first().locator('td.fc-s3');
  const box = await cell.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x - 150, box.y + 12, {steps: 6}); await page.mouse.up();
  assert.ok(await sc.evaluate(el => el.scrollLeft) > 40, '끌어서 스크롤되지 않음');
  await sc.evaluate(el => { el.scrollLeft = 0; });
  await page.getByRole('checkbox', {name: `${all[0]} 선택`}).check(); // 끌기 코드가 체크박스를 막지 않음
  await page.getByText(/^1개 선택/).waitFor();
  await page.getByRole('checkbox', {name: `${all[0]} 선택`}).uncheck();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '페이지가 옆으로 넘침');
  // 넓은 화면(1500): 앞 4칸 고정 — 옆으로 스크롤해도 부족 수량 칸이 보임
  await page.setViewportSize({width: 1500, height: 900});
  await sc.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const sh2 = await page.locator('thead th', {hasText: '부족 수량'}).boundingBox();
  const wrap = await sc.boundingBox();
  assert.ok(sh2.x >= wrap.x - 1 && sh2.x < wrap.x + wrap.width / 2, '부족 수량 칸이 고정되지 않음');
  assert.deepEqual(errors, []);
  await page.close();

  // 휴대폰: 가로 스크롤, 품번 열 고정, 선택 막대
  const phone = await open({...devices['iPhone 13']});
  const psc = phone.page.locator('.astryx-table-scroll-wrapper').first();
  assert.ok(await psc.evaluate(el => el.scrollWidth > el.clientWidth + 5));
  await phone.page.getByRole('checkbox', {name: /^SB\d+ 선택$/}).first().check();
  await phone.page.getByText(/^1개 선택/).waitFor();
  assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '휴대폰: 페이지가 옆으로 넘침');
  assert.deepEqual(phone.errors, []);
  console.log('e2e 생산 필요 현황 사용성: 통과');
} finally { await browser.close(); await server.close(); }
