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
const fmtKo = n => new Intl.NumberFormat('ko-KR').format(n);
const text = async loc => (await loc.innerText()).replace(/\s+/g, ' ').trim();
/** 입력칸 값이 v 가 될 때까지 기다림 (다른 칸에서 바꾼 값이 다음 화면 갱신 때 반영되는 경우) */
const waitValue = async (loc, v) => { for (let i = 0; i < 60 && (await loc.inputValue()) !== v; i++) await new Promise(r => setTimeout(r, 50)); assert.equal(await loc.inputValue(), v); };
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

/** 표 칸의 글자가 잘려 말줄임(…)이 되지 않음 (칸 여백 · 열 너비를 바꿀 때의 회귀 확인) */
async function checkNoClippedCells(page) {
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('table th, table td')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim())), []);
}

/** 표 칸 안에서 한 단어(띄어쓰기 없는 글자)가 두 줄로 꺾이지 않음 (예: '거래처' → '거래/처') */
async function checkNoBrokenWords(page) {
  assert.deepEqual(await page.evaluate(() => {
    const out = [];
    for (const cell of document.querySelectorAll('table th, table td')) {
      if (!cell.offsetParent) continue;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        if (t.length < 2 || /\s/.test(t)) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const lines = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top)));
        if (lines.size > 1) out.push(t);
      }
    }
    return out;
  }), []);
}

/** 고정 첫 칸: 표 스크롤 영역 왼쪽 끝에 붙어 있고(스크롤 후에도), 스크롤 전에는 옆 칸과 겹치지 않음 */
async function checkStickyColumns(page, scrollBy) {
  const problems = await page.evaluate(by => {
    const out = [];
    for (const t of document.querySelectorAll('table.sticky-first')) {
      const wrap = t.closest('.astryx-table-scroll-wrapper');
      const start = wrap.scrollLeft; // 휴대폰은 최근 기간 쪽(오른쪽 끝)에서 시작하므로 왼쪽 끝으로 옮겨서 확인 후 되돌림
      wrap.scrollLeft = 0;
      const check = when => {
        const wl = wrap.getBoundingClientRect().left;
        for (const s of t.querySelectorAll('.sticky-col')) {
          const cs = getComputedStyle(s);
          if (cs.position !== 'sticky') continue; // 휴대폰에서 고정을 푼 칸 (다운로드 목록은 품번만 고정)
          const r = s.getBoundingClientRect();
          const off = parseFloat(cs.left) || 0; // 여러 칸 고정: 앞 칸 너비만큼 오른쪽
          let next = s.nextElementSibling;
          while (next && !next.getClientRects().length) next = next.nextElementSibling; // 좁은 화면에서 숨긴 칸은 건너뜀
          // 앞에 고정 안 된 칸이 있으면(휴대폰 다운로드 목록의 삭제 칸) 처음엔 제자리, 스크롤하면 왼쪽 끝에 붙음
          const prev = s.previousElementSibling;
          if (when === '처음' && prev && getComputedStyle(prev).position !== 'sticky') continue;
          if (Math.abs(r.left - wl - off) > 1) out.push(`${when}: '${s.textContent.slice(0, 8)}' 이 왼쪽 끝(${Math.round(wl)})이 아니라 ${Math.round(r.left)}`);
          if (when === '처음' && next && r.right > next.getBoundingClientRect().left + 0.5) out.push(`처음: '${s.textContent.slice(0, 8)}' 이 옆 칸과 겹침`);
        }
      };
      check('처음');
      if (by && wrap.scrollWidth > wrap.clientWidth) { wrap.scrollLeft = by; check('스크롤 후'); }
      wrap.scrollLeft = start;
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
  await checkNoClippedCells(page);
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
  await page.getByRole('heading', {level: 1, name: '판매 현황'}).waitFor(); // 화면 코드는 처음 열 때 받아옴
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
  const foot = await text(page.locator('tfoot tr'));
  assert.match(foot, /^합계 .* 6,890$/);
  assert.doesNotMatch(foot, /100,585/); // 서로 다른 품목의 가용재고는 더하지 않음
  assert.equal(await page.getByRole('columnheader', {name: /집계 중/}).count(), 1); // 이번 분기
  assert.ok((await page.locator('tbody td.num').allInnerTexts()).includes('-'));
  await checkStickyColumns(page);
  await checkNoClippedCells(page);
  await shot(page, 'sales-customer');

  // ---- 판매 현황 · 품목별: '세럼' 입력 후 Enter → 선택 + 합계 행 + CSV
  await page.getByRole('tab', {name: '품목별'}).click();
  const box = page.getByRole('textbox', {name: '품번 / 품명 검색'});
  await box.fill('세럼');
  await box.press('Enter');
  await page.getByText('SB001 · 성분 에디터 세럼').waitFor();
  assert.match(await text(page.locator('tfoot tr')), /^합계 .* 6,400$/);
  // 한 달 밀림 회귀 확인: 화면에 그려진 (머리글의 달, 칸 값) 이 시트 원본을 직접 더한 값과 같은지 (A상사 · B유통, 수량이 달마다 다름)
  const ymOf = v => { const t = String(v).replace(/[./]/g, '-'); let m = /^(\d{4})-(\d{1,2})-/.exec(t); if (m) return [+m[1], +m[2]]; m = /^(\d{1,2})-\d{1,2}-(\d{4})$/.exec(t); return m ? [+m[2], +m[1]] : null; };
  const grid = await page.evaluate(() => {
    const t = document.querySelector('table.fixed-cols');
    const heads = [...t.querySelectorAll('thead th')].map(th => (th.classList.contains('gap-col') ? null : th.textContent.replace('집계 중', '').trim()));
    return [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map((td, i) => [heads[i], td.textContent.trim()]));
  });
  const singleYear = !grid[0].some(([h]) => h && /^\d{2}\./.test(h));
  const sold = {};
  for (const r of files.판매실적) {
    const ym = r[6] === 'SB001' && ['A상사', 'B유통'].includes(r[4]) && ymOf(r[2]);
    if (!ym) continue;
    const label = singleYear ? `${ym[1]}월` : `${String(ym[0]).slice(2)}.${ym[1]}월`;
    sold[r[4]] ??= {};
    sold[r[4]][label] = (sold[r[4]][label] || 0) + Number(r[7].replace(/,/g, ''));
  }
  let compared = 0;
  for (const row of grid) {
    const cust = row[0][1];
    if (!sold[cust]) continue;
    for (const [head, cell] of row.slice(1)) {
      if (!head || head === '합계') continue;
      assert.equal(cell, head in sold[cust] ? fmtKo(sold[cust][head]) : '-', `${cust} ${head}`);
      compared++;
    }
  }
  assert.ok(compared >= 20, '비교한 칸 수 ' + compared);
  // 품목별: 데이터에 판매가 없는 달(25.11 · 25.12)은 빗금 열 하나로, 이번 달은 '집계 중'
  assert.deepEqual(await page.locator('th.gap-col').allInnerTexts(), ['2개월 없음']);
  assert.equal(await page.getByRole('columnheader', {name: /집계 중/}).count(), 1);
  let [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'CSV 다운로드'}).click()]);
  assert.match(await page.evaluate(() => window.__lastDownloadName), /^품목별판매현황_SB001_\d{4}-\d{2}-\d{2}\.csv$/);
  let csv = await readDownload(download);
  assert.ok(csv.startsWith('﻿선택 품번: SB001\r\n거래처,'), csv.slice(0, 40));
  assert.match(csv, /\r\n합계,.*"6,400"$/);
  await checkStickyColumns(page);
  await checkNoClippedCells(page);
  await shot(page, 'sales-sku');

  // ---- 발주 현황: 기본 '발주 필요' → SB004(위험) · SB001(주의), 발주 필요 1개 품목 / 900개
  await page.goto(base + '/#/forecast');
  assert.match(await text(page.getByRole('main')), /지금 발주 필요 1개 품목 \/ 총 900개/);
  assert.deepEqual((await page.locator('tbody tr td.sticky-col code').allInnerTexts()).slice(0, 2), ['SB004', 'SB001']);
  await checkStickyColumns(page);
  await checkNoClippedCells(page); // 월 판매 · 입고예정 숫자, '발주할 수량 = ① − ② − ③' 머리글
  // 계산 설명: 처음엔 접힘, 누르면 펼쳐짐 (내용은 그대로)
  assert.equal(await page.getByText(/^발주할 수량 = ① 3개월 예상수요/).isVisible(), false);
  await page.getByText('발주할 수량 계산 방법').click();
  await page.getByText(/^발주할 수량 = ① 3개월 예상수요/).waitFor();
  // 행 펼치기: 창고별 가용재고 합계 = 전체 창고 2,300
  await page.locator('tr', {has: page.getByText('SB001', {exact: true})}).getByRole('button', {name: '거래처별 근거 보기'}).click();
  await page.getByRole('heading', {name: '창고별 가용재고 (전체 창고)'}).waitFor();
  assert.match(await text(page.getByRole('main')), /합계 2,300/);
  await checkNoClippedCells(page);
  await checkNoBrokenWords(page); // 펼친 근거 표의 거래처 이름 · 머리글
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
  await page.getByText('기준 설정 (고급) · 히어로 품목').click();
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
  await checkNoClippedCells(page);
  // 히어로 표: 글자 칸(품명)은 왼쪽, 숫자 칸(현재 가용재고)은 오른쪽 정렬
  assert.deepEqual(await page.evaluate(() => {
    const ths = [...document.querySelectorAll('table.mini-table th')];
    const align = name => getComputedStyle(ths.find(t => t.textContent.trim() === name)).textAlign;
    return [align('품명'), align('현재 가용재고')];
  }), ['start', 'end']);
  await shot(page, 'forecast-rules');
  await page.getByRole('button', {name: '삭제'}).click();
  await page.getByText('등록된 히어로 품목이 없습니다.').waitFor();
  assert.equal(await page.getByText(/히어로 품목 위험 알람/).count(), 0);

  // ---- 팀 전환 · 업로드 완료 문구
  await page.goto(base + '/#/overview');
  await page.getByRole('radio', {name: '전체'}).click();
  await page.getByText(/^품목 11개 · 거래처 5곳 · 판매실적 35건$/).waitFor();
  await page.goto(base + '/#/data');
  assert.equal(await page.getByText(/^업데이트 완료/).textContent(), '업데이트 완료 — 새로 반영: 가용재고조회, 제품일정표, 일자별판매실적분석, 유통기한, 상품마스터. 좌측 메뉴에서 전체 개요를 확인하세요.');
  // 수동 업로드 검사: 머리글만 있는 파일은 적용할 수 없고, 현재 데이터는 그대로
  await page.locator('input[type=file]').setInputFiles([{name: '가용재고조회_빈파일.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse(sh.inventory.slice(0, 2)))}]);
  await page.getByText('가용재고조회_빈파일.csv: 데이터 행이 없습니다').waitFor();
  assert.equal(await page.getByRole('button', {name: '대시보드에 적용'}).isDisabled(), true);
  await page.getByRole('button', {name: '목록 지우기'}).click();
  assert.equal(await page.getByText('데이터 행이 없습니다').count(), 0);
  await page.goto(base + '/#/overview');
  await page.getByText(/^품목 11개 · 거래처 5곳 · 판매실적 35건$/).waitFor();
  assert.deepEqual(errors, []);

  // ---- 바코드 · 거래처 조회 (1단계: 입력 · 품목 카드). 선택 동작은 lookup.view.test.js 에서 운영 화면과 비교, 여기서는 실제 화면 조작
  await page.goto(base + '/#/lookup');
  await page.getByLabel('바코드 / 품번').fill('8800000000011 1500\nMT003\nUNKNOWN');
  await page.getByLabel('품명 검색 (부분 일치)').fill('세트');
  await page.getByRole('button', {name: '조회', exact: true}).click();
  assert.equal(await text(page.locator('.lookup-toolbar > :first-child')), '조회 결과 5개 품목 · 못 찾음 1건');
  const card = pn => page.locator('.product-card').filter({has: page.locator('code.pn-lg', {hasText: new RegExp('^' + pn + '$')})});
  const sb1 = card('SB001');
  assert.equal(await sb1.getByLabel('필요 수량').inputValue(), '1500'); // 바코드 뒤 숫자 = 필요 수량
  assert.equal(await text(sb1.locator('.need-diff b')), '-1,500개');
  // 창고: 행을 누르면 담김(체크 + 추가됨), 다시 눌러도 · 체크칸을 눌러도 빠지지 않음
  const emp = sb1.locator('.pick-row', {hasText: 'EMP 물류'});
  await emp.locator('td').nth(1).click();
  assert.equal(await emp.getByRole('checkbox').isChecked(), true);
  assert.equal(await emp.getByText('추가됨').count(), 1);
  assert.equal(await text(sb1.locator('.need-diff b')), '-1,200개');
  await emp.locator('td').nth(1).click();
  await emp.getByRole('checkbox').click();
  assert.equal(await emp.getByRole('checkbox').isChecked(), true);
  await page.getByRole('button', {name: '선택 항목 보기 (1)'}).waitFor();
  // 키보드: 체크칸에서 Space 로 담기
  const b2 = sb1.locator('.pick-row', {hasText: 'B2B2팀 창고'});
  await b2.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  assert.equal(await b2.getByRole('checkbox').isChecked(), true);
  assert.equal(await text(sb1.locator('.need-diff b')), '-400개');
  // LOT: 누르면 담기고 다시 누르면 빠짐
  const lot = sb1.locator('.pick-row').filter({has: page.getByRole('checkbox', {name: 'LOT L-LONG2 담기', exact: true})});
  await lot.locator('td').nth(1).click();
  assert.equal(await lot.getByRole('checkbox').isChecked(), true);
  await lot.locator('td').nth(2).click();
  assert.equal(await lot.getByRole('checkbox').isChecked(), false);
  // 입고예정 칩: 누르면 담기고 다시 누르면 빠짐
  const chip = sb1.locator('.incoming-chips').getByRole('checkbox').first();
  await chip.click({force: true});
  assert.equal(await chip.isChecked(), true);
  assert.equal(await sb1.locator('.incoming-chips').getByText('추가됨').count(), 1);
  await chip.click({force: true});
  assert.equal(await chip.isChecked(), false);
  // 필요 수량 바꾸면 부족/여유도 바뀜
  await sb1.getByLabel('필요 수량').fill('1000');
  await sb1.getByLabel('필요 수량').press('Tab'); // 입력을 마치면 반영 (기존과 같음)
  assert.equal(await text(sb1.locator('.need-diff b')), '+100개');
  // 대체 품번: 있으면 펼친 채로(2개), 없으면 한 줄 안내
  assert.equal(await card('SB004').locator('.alt-item').count(), 2);
  assert.equal(await sb1.getByText(/^동일 바코드 다른 품번 없음/).count(), 1);
  // 추천 선택: 재고 없는 품목은 '재고없음' 이 담김 · 전체 추천 선택
  await card('MT003').getByRole('button', {name: '추천 선택'}).click();
  assert.equal(await card('MT003').locator('.pick-row', {hasText: '재고없음'}).getByRole('checkbox').isChecked(), true);
  await page.getByRole('button', {name: '전체 추천 선택 (5개 품목)'}).click();
  assert.equal(await card('SB006').locator('.pick-row', {hasText: 'EMP 물류'}).first().getByRole('checkbox').isChecked(), true);
  // 선택 항목 보기 → 다운로드 목록 자리로 이동
  const jump = page.getByRole('button', {name: /^선택 항목 보기 \(\d+\)$/});
  await jump.click();
  await page.waitForFunction(() => { const r = document.getElementById('lookup-export').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }); // 맨 아래라 더 못 올라가도 목록 전체가 보임
  // 선택완료(접기) → 선택 요약 한 줄 → 펼치기
  await sb1.getByRole('button', {name: '선택완료'}).click();
  assert.equal(await text(page.locator('.product-card.is-collapsed').first()), 'SB001 성분 에디터 세럼 창고 3개 · 유통기한 1개 펼치기'); // EMP · B2B2 + 추천(B2B1팀 창고) · 추천 LOT
  await page.locator('.product-card.is-collapsed').getByRole('button', {name: '펼치기'}).click();
  assert.equal(await page.locator('.product-card.is-collapsed').count(), 0); // 단추 한 번 = 한 번만 펼침
  // 박스 정보: 파일에 값이 없는 칸만 입력, 접었다 펴도 입력값 유지
  const sb5 = card('SB005');
  await sb5.getByText('아웃박스 · 인박스 · 중량 정보').click();
  await sb5.getByLabel('아웃박스 W(mm)').fill('400');
  await sb5.getByText('아웃박스 · 인박스 · 중량 정보').click();
  await sb5.getByText('아웃박스 · 인박스 · 중량 정보').click();
  assert.equal(await sb5.getByLabel('아웃박스 W(mm)').inputValue(), '400');
  assert.equal(await card('SB006').getByLabel('아웃박스 W(mm)').count(), 0); // SB006 은 파일에 규격이 있어 고정 표시
  await checkNoClippedCells(page);
  await shot(page, 'lookup');
  // ---- 다운로드 목록 (2단계): 행 수 · 고정 3칸 · 우선순위대로 할당 · 목록에서 입력 · 빼기 · 열 너비 · 끌어 스크롤
  const xl = page.locator('#lookup-export');
  const xrows = xl.locator('tbody tr');
  const n = await xrows.count();
  assert.equal(await text(xl.locator('h2')), `다운로드 목록 (${n})`);
  await page.getByRole('button', {name: `선택 항목 보기 (${n})`}).waitFor();
  assert.equal(await xl.locator('thead tr').last().locator('th').count(), 33);
  await checkStickyColumns(page, 900);
  const xrow = (pn, wh) => xrows.filter({has: page.locator('td.sticky-pn', {hasText: new RegExp('^' + pn + '$')})}).filter({hasText: wh});
  const allocOf = async (pn, wh) => text(xrow(pn, wh).locator('td').nth(8));
  // SB001 필요 1,000: 우선순위 EMP(1, 300) → B2B2(2, 800) → B2B1(3, 추천)
  assert.deepEqual([await allocOf('SB001', 'EMP 물류'), await allocOf('SB001', 'B2B2팀 창고'), await allocOf('SB001', 'B2B1팀 창고')], ['300', '700', '0']);
  const prio = xrow('SB001', 'B2B1팀 창고').getByLabel('SB001 B2B1팀 창고 우선순위');
  await prio.fill('1'); await prio.press('Tab');
  assert.deepEqual([await allocOf('SB001', 'EMP 물류'), await allocOf('SB001', 'B2B1팀 창고'), await allocOf('SB001', 'B2B2팀 창고')], ['300', '700', '0']);
  // 목록의 필요수량 = 카드의 필요 수량 (같은 값)
  const xneed = xrow('SB001', 'EMP 물류').getByLabel('SB001 필요수량');
  await xneed.fill('2500'); await xneed.press('Tab');
  await waitValue(sb1.getByLabel('필요 수량'), '2500');
  assert.equal(await text(sb1.locator('.need-diff b')), '-200개');
  assert.equal(await text(xrow('SB001', 'EMP 물류').locator('td').nth(10)), '-200개');
  // 목록에서 넣은 박스 값이 카드에도 보임
  const mt3box = xrow('MT003', '재고없음').getByLabel('아웃박스 입수');
  await mt3box.fill('24'); await mt3box.press('Tab');
  await card('MT003').getByText('아웃박스 · 인박스 · 중량 정보').click();
  await waitValue(card('MT003').getByLabel('아웃박스 입수'), '24');
  // 행 삭제 → 카드의 창고 체크도 풀림
  await xrow('SB001', 'B2B2팀 창고').getByRole('button', {name: '삭제'}).click();
  assert.equal(await sb1.locator('.pick-row', {hasText: 'B2B2팀 창고'}).getByRole('checkbox').isChecked(), false);
  // 열 너비: 품명 손잡이를 끌면 넓어지고 표는 움직이지 않음, 키보드 → 로 10px
  const nameTh = xl.locator('thead th.sticky-name');
  const w0 = (await nameTh.boundingBox()).width;
  const hb = await xl.getByRole('separator', {name: '품명 열 너비'}).boundingBox();
  const wrap = () => page.evaluate(() => document.querySelector('.export-table').closest('.astryx-table-scroll-wrapper').scrollLeft);
  const sl0 = await wrap();
  await page.mouse.move(hb.x + 4, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 64, hb.y + hb.height / 2, {steps: 5}); await page.mouse.up();
  assert.ok(Math.abs((await nameTh.boundingBox()).width - (w0 + 60)) <= 1);
  assert.equal(await wrap(), sl0);
  await xl.getByRole('separator', {name: '품명 열 너비'}).focus(); await page.keyboard.press('ArrowRight');
  assert.ok(Math.abs((await nameTh.boundingBox()).width - (w0 + 70)) <= 1);
  await checkStickyColumns(page, 900); // 넓힌 품명 칸 뒤로도 고정 위치가 맞음
  // 표의 빈 곳을 끌면 옆으로 스크롤, 그 끌기는 단추 · 입력에 영향 없음
  await page.evaluate(() => { document.querySelector('.export-table').closest('.astryx-table-scroll-wrapper').scrollLeft = 0; });
  await xrow('SB001', 'EMP 물류').scrollIntoViewIfNeeded();
  const vc = await xrow('SB001', 'EMP 물류').locator('td').nth(4).boundingBox();
  await page.mouse.move(vc.x + vc.width / 2, vc.y + vc.height / 2); await page.mouse.down(); await page.mouse.move(vc.x - 200, vc.y + vc.height / 2, {steps: 8}); await page.mouse.up();
  assert.ok(await wrap() >= 150);
  assert.equal(await xrows.count(), n - 1);
  await checkNoClippedCells(page);
  await shot(page, 'lookup-export');

  // ---- PLT 계산 · 엑셀 다운로드 (3단계): 품목별 → 혼적 O. 숫자는 lookup.view.test.js 에서 운영과 비교, 여기서는 화면 조작 · 파일
  const heads = () => xl.locator('thead tr').last().locator('th').count();
  await xl.getByRole('button', {name: 'PLT 계산'}).click();
  assert.match(await text(xl.locator('.plt-summary .stat').first()), /^품목별 개별 계산 기준 총 예상 PLT [\d,.]+ PLT$/);
  assert.match(await text(xrow('SB001', 'EMP 물류').locator('td').nth(25)), /^[\d,]+$/); // 예상 총 박스수
  assert.equal(await heads(), 33);
  // 혼적 O 와 입력값은 'PLT 계산' 을 눌러야 반영 (기존과 같음), 입력값은 계산 후에도 그대로
  await xl.getByLabel('PLT 가로(cm)').fill('120'); await xl.getByLabel('PLT 가로(cm)').press('Tab');
  await xl.getByRole('radio', {name: '혼적 O'}).click();
  assert.equal(await heads(), 33);
  await xl.getByRole('button', {name: 'PLT 계산'}).click();
  assert.equal(await heads(), 32); // 'PLT 최대 적재 가능 박스수' 는 품목별일 때만
  assert.match(await text(xl.locator('.plt-summary .stat').first()), /^혼적 기준 총 예상 PLT [\d,]+ PLT$/);
  assert.equal(await xl.getByLabel('PLT 가로(cm)').inputValue(), '120');
  await xl.getByRole('button', {name: 'PLT 상세보기'}).click();
  const packN = await xl.locator('.packing tbody tr').count();
  assert.equal(await text(xl.locator('.plt-summary .stat').first()), `혼적 기준 총 예상 PLT ${packN} PLT`); // 혼적 PLT 수 = 구성 표의 PLT 수
  await xl.getByRole('button', {name: 'PLT 상세 숨기기'}).click();
  assert.equal(await xl.locator('.packing').count(), 0);
  // 엑셀 다운로드: 파일 이름 · 머리글 · 행 수 (+ 합계 · 혼적 구성)
  const [xdl] = await Promise.all([page.waitForEvent('download'), xl.getByRole('button', {name: '엑셀 다운로드'}).click()]);
  assert.match(await page.evaluate(() => window.__lastDownloadName), /^재고선택목록_\d{4}-\d{2}-\d{2}\.csv$/);
  const xcsv = (await readDownload(xdl)).replace(/^\uFEFF/, '').split('\r\n');
  assert.ok(xcsv[0].startsWith('품번,품명,ERP 바코드,바코드,창고,우선순위,가용재고,할당수량,필요수량,부족/여유'));
  assert.ok(xcsv[1 + (await xrows.count())].startsWith('합계(혼적 기준)'));
  assert.equal(xcsv.filter(l => /^PLT \d+,/.test(l)).length, packN);
  await checkNoClippedCells(page);

  // 바코드 지우기: 결과도 비움 (품명 입력은 그대로)
  await page.getByRole('button', {name: '바코드 지우기'}).click();
  assert.equal(await page.locator('.product-card').count(), 0);
  assert.equal(await page.getByLabel('품명 검색 (부분 일치)').inputValue(), '세트');
  // 결과를 지워도 다운로드 목록은 남고, '전체 지우기' 로 비움
  assert.equal(await xrows.count(), n - 1);
  await xl.getByRole('button', {name: '전체 지우기'}).click();
  assert.equal(await page.locator('#lookup-export').count(), 0);
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
  // 휴대폰: 판매 표는 최근 기간(오른쪽 끝, 합계 포함)이 보이게 열림
  await phone.page.locator('table.sticky-first').first().waitFor();
  assert.ok(await phone.page.evaluate(() => { const w = document.querySelector('.astryx-table-scroll-wrapper'); return w.scrollLeft > 0 && Math.abs(w.scrollLeft + w.clientWidth - w.scrollWidth) < 2; }));
  await checkStickyColumns(phone.page, 200);
  await phone.page.goto(base + '/#/forecast');
  await phone.page.locator('tbody tr td.sticky-col code').first().waitFor();
  await checkStickyColumns(phone.page, 300);
  await checkNoClippedCells(phone.page);
  // 휴대폰 상태 · 브랜드 필터: 모든 버튼이 화면 안에 있고, 마지막 버튼(과잉재고)까지 누를 수 있음
  assert.deepEqual(await phone.page.evaluate(() => [...document.querySelectorAll('[role=main] [aria-label="상태"] button, [role=main] [aria-label="브랜드"] button')]
    .filter(b => b.checkVisibility()) // 닫힌 머리글 '필터' 팝업 안의 브랜드 버튼은 제외
    .filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5; }).map(b => b.textContent)), []);
  assert.equal(await phone.page.locator('[aria-label="상태"] button:visible').count(), 7); // 발주 필요 · 위험 · 주의 · 여유 · 참고 · 전체 · 과잉재고
  await phone.page.getByRole('button', {name: '과잉재고'}).click();
  await phone.page.getByRole('button', {name: '과잉재고', pressed: true}).waitFor();
  await phone.page.getByRole('button', {name: /^발주 필요 \(위험\+주의\)/}).click();
  await shot(phone.page, 'forecast-mobile');
  // 휴대폰 조회: 입력은 한 줄에 하나, 버튼 · 칸이 화면 밖으로 나가지 않음, 넓은 창고 표는 마우스로 끌어 옆으로 이동
  await phone.page.goto(base + '/#/lookup');
  await phone.page.getByLabel('바코드 / 품번').fill('8800000000011 1500\n8800000000097');
  await phone.page.getByRole('button', {name: '조회', exact: true}).click();
  await phone.page.locator('.product-card').first().waitFor();
  await checkNoClippedCells(phone.page);
  assert.deepEqual(await phone.page.evaluate(() => [...document.querySelectorAll('[role=main] button, [role=main] input, [role=main] textarea')]
    .filter(b => b.checkVisibility() && !b.closest('.pick-scroll'))
    .filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5; }).map(b => b.textContent || b.getAttribute('aria-label'))), []);
  const wrow = phone.page.locator('.product-card').first().locator('.pick-row', {hasText: 'EMP 물류'});
  await wrow.scrollIntoViewIfNeeded();
  const cell = await wrow.locator('td').nth(2).boundingBox();
  const scroller = () => phone.page.evaluate(() => { const t = document.querySelector('.product-card .pick-table'); for (let e = t; e; e = e.parentElement) if (e.scrollLeft > 0) return e.scrollLeft; return 0; });
  assert.equal(await scroller(), 0);
  // 세로로 끌면(글자 선택) 표가 움직이지 않음
  await phone.page.mouse.move(cell.x + 10, cell.y + 5); await phone.page.mouse.down(); await phone.page.mouse.move(cell.x + 12, cell.y + 60, {steps: 5}); await phone.page.mouse.up();
  assert.equal(await scroller(), 0);
  // 옆으로 끌면 스크롤되고, 그 끌기는 행 선택(클릭)으로 처리되지 않음
  await phone.page.mouse.move(cell.x + cell.width - 4, cell.y + cell.height / 2); await phone.page.mouse.down();
  await phone.page.mouse.move(cell.x - 120, cell.y + cell.height / 2, {steps: 8}); await phone.page.mouse.up();
  assert.ok(await scroller() > 0);
  assert.equal(await wrow.getByRole('checkbox').isChecked(), false);
  // 그냥 누르면 담김
  await wrow.locator('td').nth(1).click();
  assert.equal(await wrow.getByRole('checkbox').isChecked(), true);
  // 휴대폰 다운로드 목록: 품번 한 칸만 고정, 끝 열까지 스크롤해서 볼 수 있음, PLT 입력 · 단추는 화면 안
  await phone.page.getByRole('button', {name: /^전체 추천 선택/}).click();
  await phone.page.getByRole('button', {name: 'PLT 계산'}).click();
  await phone.page.locator('#lookup-export').scrollIntoViewIfNeeded();
  assert.deepEqual(await phone.page.evaluate(() => [...document.querySelectorAll('#lookup-export button, #lookup-export input')]
    .filter(b => b.checkVisibility() && !b.closest('.export-table') && b.getBoundingClientRect().width > 2) // 1px 로 숨긴 선택 단추(radio)는 제외
    .filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5; }).map(b => b.textContent || b.getAttribute('aria-label'))), []);
  await checkStickyColumns(phone.page, 300);
  assert.equal(await phone.page.evaluate(() => getComputedStyle(document.querySelector('.export-table th.sticky-name')).position), 'static');
  assert.ok(await phone.page.evaluate(() => {
    const w = document.querySelector('.export-table').closest('.astryx-table-scroll-wrapper');
    w.scrollLeft = w.scrollWidth;
    const last = document.querySelector('.export-table thead tr:last-child th:last-child').getBoundingClientRect();
    return last.right <= w.getBoundingClientRect().right + 1 && last.left >= 0;
  }));
  await checkNoClippedCells(phone.page);
  await shot(phone.page, 'lookup-mobile');
  assert.deepEqual(phone.errors, []);

  // ---- 구글시트(Apps Script 웹앱) 연결: 가짜 웹앱 주소로 성공 · 실패. 실제 운영 웹앱 주소로는 요청하지 않음 (아래 route 가 막음)
  const gs = await browser.newPage();
  const gsErrors = [], gsCalls = [];
  gs.on('pageerror', e => gsErrors.push(e.message));
  await gs.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host === 'webapp.example.test') {
      gsCalls.push(u.pathname + u.search);
      if (u.searchParams.get('action') === 'progress') return r.fulfill({json: {status: 'running', done: 3, total: 6, current: '판매실적'}});
      if (u.pathname === '/fail') return r.fulfill({status: 500, body: 'x'});
      return r.fulfill({json: {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster}});
    }
    if (u.href.includes('papaparse.min.js')) return r.fulfill({path: require.resolve('papaparse/papaparse.min.js'), contentType: 'text/javascript'});
    return u.href.startsWith(base) ? r.continue() : r.abort();
  });
  await gs.goto(base + '/#/data');
  const gsUrl = gs.getByLabel('Apps Script 웹앱 URL');
  await gsUrl.fill('https://webapp.example.test/fail');
  await gs.getByRole('button', {name: '지금 가져오기'}).click();
  await gs.getByText(/^새로고침 실패: 웹앱 호출에 실패했습니다 \(상태 500\)/).waitFor();
  await gsUrl.fill('https://webapp.example.test/exec');
  await gs.getByRole('button', {name: '지금 가져오기'}).click();
  await gs.getByText(/^업데이트 완료 — 새로 반영: 가용재고조회, 제품일정표, 일자별판매실적분석, 유통기한, 상품마스터/).waitFor();
  assert.ok(gsCalls.includes('/exec') && gsCalls.includes('/fail'));
  // CSV 로 올렸을 때와 같은 결과 (개요 첫 줄 숫자)
  await gs.goto(base + '/#/overview');
  await gs.getByText(/^품목 11개 · 거래처 4곳 · 판매실적 30건$/).waitFor();
  assert.deepEqual(gsErrors, []);
  await gs.close();

  console.log('e2e 업로드 · 개요 · 판매 현황 · 발주 현황 · 조회 · 휴대폰 배치 · 구글시트 연결: 통과');
} finally {
  await browser.close();
  await server.close();
}
