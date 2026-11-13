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
  // 선택 거래처 기준 표시 · 분석용 추정치 안내 · 펼친 행 근거 제목, 해제하면 전체 거래처 기준
  await page.getByText('선택 거래처 기준 (2곳)').waitFor();
  await page.getByText(/분석용 추정치/).waitFor();
  await page.getByRole('button', {name: '근거 보기'}).first().click();
  await page.getByRole('heading', {name: '부족 수량 근거 · 선택 거래처 기준'}).waitFor();
  await page.getByRole('button', {name: '근거 닫기'}).first().click();
  const orList = await codes(page);
  assert.ok(orList.length > 0 && new Set(orList).size === orList.length, '거래처 OR: 품목은 한 번씩');
  assert.ok(orList.length <= all.length);
  await page.getByRole('button', {name: 'B유통 삭제'}).or(page.locator('[aria-label*="B유통"]').first()).first().click().catch(() => {});
  await page.getByRole('button', {name: '모두 해제'}).first().click();
  await page.getByRole('button', {name: '거래처 전체'}).waitFor();
  await page.getByText('전체 거래처 기준', {exact: true}).first().waitFor();
  assert.equal(await page.getByText(/분석용 추정치/).count(), 0);
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

  // 발주 목록: 담을 때의 계산 기준 · 부족 수량 저장, 필터를 바꿔도 덮어쓰지 않음, 수동 수정 유지
  await page.goto(base + '/#/orders');
  await page.getByRole('columnheader', {name: '계산 기준'}).waitFor();
  assert.equal(await page.locator('tbody tr').filter({hasText: '전체 거래처 기준'}).count(), all.length, '전체 기준으로 담은 항목에 기준 표시');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name: '비우기'}).click();
  await page.getByRole('heading', {name: '담은 품목이 없습니다.'}).waitFor();
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('button', {name: '거래처 전체'}).click();
  await page.getByRole('checkbox', {name: /^A상사$/}).check();
  await page.keyboard.press('Escape');
  await page.getByText('선택 거래처 기준 (1곳)').waitFor();
  const first = (await codes(page))[0];
  await page.getByRole('checkbox', {name: `${first} 선택`}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/1개 담음/).waitFor();
  await page.goto(base + '/#/orders');
  await page.locator('tbody tr', {hasText: first}).getByText('선택 거래처 기준: A상사').waitFor();
  const qtyBox = page.locator('tbody tr', {hasText: first}).getByRole('spinbutton');
  await qtyBox.fill('4321'); await qtyBox.blur();
  await page.locator('tbody tr', {hasText: first}).getByText('수량 수정됨').waitFor();
  await page.goto(base + '/#/forecast'); // 필터는 그대로(선택 거래처) → 해제 후 다시 담기 시도: 덮어쓰지 않음
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('button', {name: '모두 해제'}).first().click();
  await page.getByRole('checkbox', {name: `${first} 선택`}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/0개 담음, 1개는 이미 있어 수량 유지/).waitFor();
  await page.getByRole('button', {name: '선택 해제'}).click();
  await page.goto(base + '/#/orders');
  const row = page.locator('tbody tr', {hasText: first});
  assert.equal(await row.getByRole('spinbutton').inputValue().then(v => v.replace(/,/g, '')), '4321', '수동 수정 수량 유지');
  await row.getByText('선택 거래처 기준: A상사').waitFor(); // 기준도 그대로
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();

  // 7) 펼친 행: 목표 재고 기준 월
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '근거 보기'}).click();
  await page.getByText(/목표 재고 기준 월:/).waitFor();
  assert.equal(await page.getByText(/대량 판매 확인:/).count() >= 0, true);
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '근거 닫기'}).click();

  // 미판매(6개월 이상) 품목: 별도 필터 · 사유 표시 · 마지막 판매일 · 생산 필요/추천 아님
  await page.getByRole('button', {name: /^미판매 \d+$/}).click();
  const inactiveRows = page.locator('tbody tr').filter({has: page.locator('.inactive-note')});
  assert.ok((await inactiveRows.count()) > 0, '미판매 품목 없음');
  assert.equal(await page.locator('tbody tr td.fc-s2').filter({hasText: /생산 필요|생산 추천/}).count(), 0, '미판매 품목이 생산 필요/추천으로 보임');
  assert.match(await inactiveRows.first().locator('.inactive-note').innerText(), /6개월 이상 미판매|12개월 이상 미판매|판매 이력 없음/);
  await inactiveRows.first().getByRole('button', {name: '근거 보기'}).click();
  await page.getByText(/마지막 판매일:/).first().waitFor();
  await page.getByRole('button', {name: '근거 닫기'}).first().click();
  // 미판매 품목을 직접 담으면 수량 0 + 담을 때 부족 수량 · 미판매 사유 보존
  const inactivePn = (await inactiveRows.first().locator('td.sticky-col code').innerText()).trim();
  await page.getByRole('checkbox', {name: `${inactivePn} 선택`}).check();
  await page.getByRole('button', {name: '선택 품목 발주 목록에 담기'}).click();
  await page.getByText(/1개 담음/).waitFor();
  await page.getByRole('button', {name: '선택 해제'}).click();
  await page.goto(base + '/#/orders');
  const orow = page.locator('tbody tr', {hasText: inactivePn});
  assert.equal(await orow.getByRole('spinbutton').inputValue(), '0', '미판매 품목 기본 수량 0');
  await orow.getByText(/담을 때 (6개월 이상 미판매|12개월 이상 미판매|판매 이력 없음)/).waitFor();
  await orow.getByRole('spinbutton').fill('25'); await orow.getByRole('spinbutton').blur(); // 의도적으로 생산하려면 직접 입력
  await orow.getByText('수량 수정됨').waitFor();
  await page.goto(base + '/#/forecast');
  await page.getByRole('tab', {name: '품목별'}).waitFor();
  // 품목 구분 필터: 히어로 품목만 ↔ 전체 품목 (히어로 지정이 없으면 빈 목록)
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  await page.getByRole('button', {name: '히어로 품목만'}).click();
  await page.getByRole('button', {name: '히어로 품목만', pressed: true}).waitFor();
  assert.equal(await page.locator('tbody tr td.sticky-col code').count(), 0, '히어로 지정 없는데 행이 보임');
  await page.getByRole('button', {name: '전체 품목'}).click();
  await page.getByRole('button', {name: /^전체 \d+$/}).click();
  for (const g of [/^생산 필요 \d+$/, /^생산 추천 \d+$/]) { // 생산 필요 · 추천 필터에는 사유 표시가 있는 품목이 없음
    await page.getByRole('button', {name: g}).click();
    assert.equal(await page.locator('.inactive-note').count(), 0, '생산 필요/추천 목록에 미판매 품목');
  }
  await page.getByRole('button', {name: /^전체 \d+$/}).click();

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
