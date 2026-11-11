// 브라우저 확인 (npm run e2e): 테스트용 ERP 시트 6개를 업로드 화면에 올리고 → 적용 → 개요 → 판매 현황 → 발주 현황 →
// 팀 전환까지 실제 Chromium 에서 확인합니다. 숫자는 운영 대시보드와 비교 테스트로 맞춘 값입니다. 마지막에 휴대폰 화면 배치도 확인합니다.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import Papa from 'papaparse';
import {makeSheets} from '../src/lib/__fixtures__/sheets.js';

const require = createRequire(import.meta.url);
const {chromium, devices} = require('playwright'); // 이 환경에 설치된 Playwright 사용
const server = await createServer({server: {port: 5174, strictPort: true}, logLevel: 'error'});
await server.listen();
const base = 'http://localhost:5174';
const sh = makeSheets(Date.now());
const files = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: true}); }; // 선택: 화면 캡처
const text = async loc => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const readDownload = d => new Promise(res => { let t = ''; d.createReadStream().then(st => st.on('data', c => (t += c)).on('end', () => res(t))); });

/** 새 화면을 열고 테스트용 시트를 올려 적용 (개요로 이동할 때까지) */
async function openWithData(browser, opts) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // CDN 대신 같은 버전의 PapaParse 를 node_modules 에서 제공 (오프라인에서도 동작)
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  // 헤드리스 브라우저는 한글 파일명을 'download' 로 바꿔서, 앱이 링크에 넣은 이름을 따로 기록
  await page.addInitScript(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__lastDownloadName = this.download; return click.call(this); };
  });
  await page.goto(base + '/#/data');
  await page.locator('input[type=file]').setInputFiles(Object.entries(files).map(([n, rows]) => ({name: n + '.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(rows))})));
  await page.getByText('인식됨: 상품마스터').waitFor();
  assert.equal(await page.getByText(/^인식됨: /).count(), 6);
  await page.getByRole('button', {name: '대시보드에 적용'}).click();
  await page.waitForURL(/#\/overview$/);
  return {page, errors};
}

/** 고정 첫 칸: 표 스크롤 영역 왼쪽 끝에 붙어 있고(스크롤 후에도), 스크롤 전에는 옆 칸과 겹치지 않음 */
async function checkStickyColumns(page, scrollBy) {
  const problems = await page.evaluate(by => {
    const out = [];
    for (const t of document.querySelectorAll('table.sticky-first')) {
      const wrap = t.closest('.astryx-table-scroll-wrapper');
      const check = when => {
        const wl = wrap.getBoundingClientRect().left;
        for (const s of t.querySelectorAll('.sticky-col')) {
          const r = s.getBoundingClientRect();
          let next = s.nextElementSibling;
          while (next && !next.getClientRects().length) next = next.nextElementSibling; // 좁은 화면에서 숨긴 칸은 건너뜀
          if (Math.abs(r.left - wl) > 1) out.push(`${when}: '${s.textContent.slice(0, 8)}' 이 왼쪽 끝(${Math.round(wl)})이 아니라 ${Math.round(r.left)}`);
          if (when === '처음' && next && r.right > next.getBoundingClientRect().left + 0.5) out.push(`처음: '${s.textContent.slice(0, 8)}' 이 옆 칸과 겹침`);
        }
      };
      check('처음');
      if (by && wrap.scrollWidth > wrap.clientWidth) { wrap.scrollLeft = by; check('스크롤 후'); wrap.scrollLeft = 0; }
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push('페이지가 옆으로 스크롤됨');
    return out;
  }, scrollBy);
  assert.deepEqual(problems, []);
}

const browser = await chromium.launch();
try {
  const {page, errors} = await openWithData(browser, {viewport: {width: 1440, height: 900}});
  await page.getByText(/^품목 11개 · 거래처 4곳 · 판매실적 30건$/).waitFor();

  // ---- 전체 개요: 운영 대시보드가 같은 데이터로 그리는 값 (views.test.js 에서 비교 확인된 숫자)
  const main = await text(page.getByRole('main'));
  for (const re of [/품목 11개/, /위험 1 .*신호 품목 5개 중 20% 소진예상 60일 미만/, /주의 1 .*신호 품목 5개 중 20% 소진예상 60~90일/, /여유 3 .*신호 품목 5개 중 60% 소진예상 90일 이상/, /참고 6 휴면 · 단발성 · 데이터 부족 \(신호 계산에서 제외\)/, /거래처 4곳 · 최근 6개월 총판매 7,080/])
    assert.match(main, re);
  // 발주 필요 (위험+주의) 목록 = 발주 현황 '발주 필요 (위험+주의)' 칩과 같은 품목 · 순서
  assert.deepEqual(await page.locator('tbody tr td.sticky-col code').allInnerTexts(), ['SB004', 'SB001']);
  await checkStickyColumns(page);
  await shot(page, 'overview');
  // 브랜드: 아무것도 안 고르면 '모든 브랜드'가 눌린 상태, 브랜드를 고르면 풀리고, 다시 누르면 전체로
  const pressed = name => page.getByRole('button', {name, exact: true, pressed: true}).count();
  assert.equal(await pressed('모든 브랜드'), 1);
  await page.getByRole('button', {name: '밀크터치', exact: true}).click();
  assert.deepEqual([await pressed('모든 브랜드'), await pressed('밀크터치')], [0, 1]);
  await page.getByRole('button', {name: '모든 브랜드', exact: true}).click();
  assert.deepEqual([await pressed('모든 브랜드'), await pressed('밀크터치')], [1, 0]);
  // 신호 칸 → 발주 현황이 그 상태로 걸러짐 (개요 숫자 = 표 행 수)
  for (const [grade, pns] of [['주의', ['SB001']], ['위험', ['SB004']]]) {
    await page.goto(base + '/#/overview');
    await page.getByRole('link', {name: new RegExp(`^${grade} \\d+개 — 발주 현황에서 보기$`)}).click();
    await page.waitForURL(/#\/forecast$/);
    await page.getByRole('button', {name: new RegExp(`^${grade} \\d+$`), pressed: true}).waitFor(); // 발주 현황 상태 칩이 그 신호로 눌림
    assert.deepEqual(await page.locator('tbody tr td.sticky-col code').allInnerTexts(), pns);
  }
  await page.goto(base + '/#/overview');
  await page.getByRole('link', {name: '발주 현황에서 전체 보기'}).click();
  await page.waitForURL(/#\/forecast$/);
  assert.deepEqual((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).slice(0, 2), ['SB004', 'SB001']);

  // ---- 판매 현황 · 거래처별: 합계 많은 순 첫 행 = SB001 (B2B1팀+EMP 가용재고 1,500, 판매 합계 6,400)
  await page.goto(base + '/#/customer');
  assert.match(await text(page.locator('tbody tr').first()), /^SB001 성분에디터 성분 에디터 세럼 1,500 .* 6,400$/);
  await page.getByRole('button', {name: '거래처 전체'}).click();
  await page.getByRole('checkbox', {name: 'A상사'}).check();
  await page.getByRole('checkbox', {name: 'B유통'}).check();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', {name: '거래처 2개 선택'}).count(), 1);
  assert.deepEqual((await page.getByRole('columnheader').allInnerTexts()).slice(0, 5), ['품번', '브랜드', '품명', '가용재고', '거래처']); // 머리글이 실제 칸 순서와 일치
  assert.match(await page.locator('td[rowspan="2"]').first().innerText(), /SB001/);
  // 고른 거래처는 칩으로 보임 · 합계 행 (더한 값은 views.test.js 에서 확인) · 판매 기록 없는 분기는 '-'
  assert.equal(await page.getByRole('button', {name: /A상사/}).count() >= 1, true);
  assert.match(await text(page.locator('tfoot tr')), /^합계 .*100,585 .* 6,890$/);
  assert.ok((await page.locator('tbody td.num').allInnerTexts()).includes('-'));
  await checkStickyColumns(page);
  await shot(page, 'sales-customer');

  // ---- 판매 현황 · 품목별: '세럼' 입력 후 Enter → 선택 + 합계 행 + CSV
  await page.getByRole('tab', {name: '품목별'}).click();
  const box = page.getByRole('textbox', {name: '품번 / 품명 검색'});
  await box.fill('세럼');
  await box.press('Enter');
  await page.getByText('SB001 · 성분 에디터 세럼').waitFor();
  assert.match(await text(page.locator('tfoot tr')), /^합계 .* 6,400$/);
  let [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'CSV 다운로드'}).click()]);
  assert.match(await page.evaluate(() => window.__lastDownloadName), /^품목별판매현황_SB001_\d{4}-\d{2}-\d{2}\.csv$/);
  let csv = await readDownload(download);
  assert.ok(csv.startsWith('﻿선택 품번: SB001\r\n거래처,'), csv.slice(0, 40));
  assert.match(csv, /\r\n합계,.*"6,400"$/);
  await checkStickyColumns(page);
  await shot(page, 'sales-sku');

  // ---- 발주 현황: 기본 '발주 필요' → SB004(위험) · SB001(주의), 발주 필요 1개 품목 / 900개
  await page.goto(base + '/#/forecast');
  assert.match(await text(page.getByRole('main')), /지금 발주 필요 1개 품목 \/ 총 900개/);
  assert.deepEqual((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).slice(0, 2), ['SB004', 'SB001']);
  await checkStickyColumns(page);
  // 행 펼치기: 창고별 가용재고 합계 = 전체 창고 2,300
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '거래처별 근거 보기'}).click();
  await page.getByRole('heading', {name: '창고별 가용재고 (전체 창고)'}).waitFor();
  assert.match(await text(page.getByRole('main')), /합계 2,300/);
  await shot(page, 'forecast-detail');
  // 표 내려받기(CSV)
  [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '표 내려받기(CSV)'}).click()]);
  assert.match(await page.evaluate(() => window.__lastDownloadName), /^발주현황_전체_\d{4}-\d{2}-\d{2}\.csv$/);
  csv = await readDownload(download);
  assert.ok(csv.startsWith('﻿구분,품번,품명,월평균 판매,3개월 예상수요,가용재고,입고예정,발주할 수량,상태\r\n'), csv.slice(0, 60));
  assert.equal(csv.split('\r\n').length, 3); // 머리글 + 2행
  // 과잉재고 · EMP 정상창고만 → 판매 없이 EMP 재고만 있는 SB006
  await page.getByRole('button', {name: '과잉재고'}).click();
  await page.getByRole('radio', {name: 'EMP 정상창고만'}).check();
  assert.deepEqual(await page.locator('tbody tr td.sticky-col code').allInnerTexts(), ['SB006']);
  await page.getByRole('button', {name: /^발주 필요 \(위험\+주의\)/}).click();
  // 기준 설정: 잘못된 값 → 안내, 리드타임 45 저장 → 구간 문구 변경 + 저장, 기본값으로
  await page.getByText('⚙ 기준 설정 (고급) · 히어로 품목').click();
  const lead = page.getByRole('textbox', {name: '리드타임(일)'}).or(page.getByRole('spinbutton', {name: '리드타임(일)'}));
  await lead.fill('20'); await lead.press('Tab');
  await page.getByRole('button', {name: '기준 저장'}).click();
  await page.getByText(/^긴급 기준은 리드타임보다 작아야 하고/).waitFor();
  await lead.fill('45'); await lead.press('Tab');
  await page.getByRole('button', {name: '기준 저장'}).click();
  await page.getByText('저장되었습니다.').waitFor();
  assert.match(await text(page.getByRole('main')), /소진예상 30~45일/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('inv_settings_v1')).rules.leadDays), 45);
  await page.getByRole('button', {name: '기본값으로'}).click();
  await page.getByText('소진예상 30~60일').waitFor();
  // 히어로 품목 추가 → 알람 → 삭제
  await page.getByRole('textbox', {name: '히어로 품번'}).fill('mt002');
  const heroMin = page.getByRole('textbox', {name: '위험 수량(이하)'}).or(page.getByRole('spinbutton', {name: '위험 수량(이하)'}));
  await heroMin.fill('200'); await heroMin.press('Tab');
  await page.getByRole('button', {name: '추가/수정'}).click();
  await page.getByText('히어로 품목 위험 알람 (1개) — B2B1팀').waitFor();
  await shot(page, 'forecast-rules');
  await page.getByRole('button', {name: '삭제'}).click();
  await page.getByText('등록된 히어로 품목이 없습니다.').waitFor();
  assert.equal(await page.getByText(/히어로 품목 위험 알람/).count(), 0);

  // ---- 팀 전환 · 업로드 완료 문구
  await page.goto(base + '/#/overview');
  await page.getByRole('radio', {name: '전체'}).click();
  await page.getByText(/^품목 11개 · 거래처 5곳 · 판매실적 35건$/).waitFor();
  await page.goto(base + '/#/data');
  assert.equal(await page.getByText(/^업데이트 완료/).textContent(), '업데이트 완료 — 새로 반영: 가용재고조회, 제품일정표, 일자별판매실적분석, 유통기한, 상품마스터. 좌측 메뉴에서 Main을 확인하세요.');
  assert.deepEqual(errors, []);

  // ---- 휴대폰: 넓은 표는 표 안에서만 옆으로 스크롤, 첫 칸은 고정
  const phone = await openWithData(browser, {...devices['iPhone 13']});
  // 휴대폰: 제목 · 필터 버튼이 본문 안에 있어 같이 스크롤됨, 팀 · 브랜드는 '필터' 버튼 하나로
  assert.equal(await phone.page.locator('.astryx-layout-content h1').count(), 1);
  await phone.page.getByRole('button', {name: 'B2B1팀 · 모든 브랜드'}).click();
  await phone.page.getByRole('button', {name: '마미케어', exact: true}).click();
  await phone.page.keyboard.press('Escape');
  await phone.page.getByRole('button', {name: 'B2B1팀 · 마미케어'}).waitFor();
  await phone.page.getByRole('button', {name: 'B2B1팀 · 마미케어'}).click();
  await phone.page.getByRole('button', {name: '모든 브랜드', exact: true}).click();
  await phone.page.keyboard.press('Escape');
  await checkStickyColumns(phone.page, 200);
  await shot(phone.page, 'overview-mobile');
  await phone.page.goto(base + '/#/customer');
  await checkStickyColumns(phone.page, 200);
  await phone.page.goto(base + '/#/forecast');
  await phone.page.locator('tbody tr td.sticky-col code').first().waitFor();
  await checkStickyColumns(phone.page, 300);
  await shot(phone.page, 'forecast-mobile');
  assert.deepEqual(phone.errors, []);
  console.log('e2e 업로드 · 개요 · 판매 현황 · 발주 현황 · 휴대폰 배치: 통과');
} finally {
  await browser.close();
  await server.close();
}
