// 새 기능 확인 (npm run e2e:features): 데모 빌드(dist-demo, 테스트 데이터)에서 상품 상세 · 발주 목록 · 검색 · 화면 모드 ·
// 거래처 분석 · 재고 점검 · 저장된 보기를 데스크톱과 휴대폰 크기로 실제 조작해 확인합니다.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, normalize} from 'node:path';

const require = createRequire(import.meta.url);
const {chromium, devices} = require('playwright');
const ROOT = new URL('../dist-demo/', import.meta.url).pathname;
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { res.writeHead(200, {'Content-Type': TYPES[extname(path)] || 'text/html'}).end(await readFile(join(ROOT, path === '/' ? 'index.html' : path))); }
  catch { res.writeHead(404).end('not found'); }
}).listen(4182);
const base = 'http://preview.test:4182';
const browser = await chromium.launch({args: ['--host-resolver-rules=MAP preview.test 127.0.0.1']});
const noOverflow = async (page, where) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${where}: 페이지가 옆으로 넘침`);
try {
  for (const [name, opts] of [['데스크톱', {viewport: {width: 1440, height: 900}, acceptDownloads: true}], ['휴대폰', {...devices['iPhone 13'], acceptDownloads: true}]]) {
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await page.goto(base + '/#/overview');
    await page.getByText('재고 신호등').waitFor();
    // 개요: 새 요약 3칸
    await page.getByRole('heading', {name: '월별 판매'}).waitFor();
    await page.getByRole('heading', {name: '오래 주문 없는 거래처'}).waitFor();
    await noOverflow(page, name + ' 개요');

    // 품번 → 상세 패널 (모든 화면 공통)
    await page.locator('.pn-link').first().click();
    const drawer = page.getByRole('dialog', {name: '상품 상세'});
    await drawer.waitFor();
    await drawer.getByText('가용재고').first().waitFor();
    await drawer.getByRole('heading', {name: '창고별 재고'}).waitFor();
    // 발주 목록에 담기 → 목록 화면에서 수량 수정 → CSV
    await drawer.getByRole('button', {name: '발주 목록에 담기'}).click();
    await page.keyboard.press('Escape');
    await drawer.waitFor({state: 'hidden'});
    await page.goto(base + '/#/orders');
    await page.getByRole('heading', {name: '발주 목록', level: 1}).waitFor();
    const qty = page.getByRole('spinbutton').first();
    await qty.fill('1234'); await qty.blur();
    assert.match(await qty.inputValue(), /^1,?234$/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /CSV 내려받기/}).click()]);
    assert.match(dl.suggestedFilename(), /^(발주목록_\d{4}-\d{2}-\d{2}\.csv|download)$/); // 헤드리스 Chromium 은 한글 파일 이름을 'download' 로 보여 줌 (실제 Chrome 은 그대로 저장)
    const csv = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
    assert.ok(csv.startsWith('﻿품번,'), 'BOM + 머리글');
    assert.match(csv, /,1234\r?\n?$/m, '수정한 수량이 CSV 에 들어감');
    await noOverflow(page, name + ' 발주 목록');

    // 전체 검색
    await page.keyboard.press('Control+k');
    const box = page.getByRole('dialog', {name: '품목 검색'});
    await box.waitFor();
    await page.keyboard.type('SB0');
    await box.getByRole('option').first().waitFor();
    await box.getByRole('option').first().click();
    await page.getByRole('dialog', {name: '상품 상세'}).waitFor();
    await page.keyboard.press('Escape');

    // 거래처 분석 · 재고 점검
    await page.goto(base + '/#/customers');
    await page.getByRole('heading', {name: '거래처 분석', level: 1}).waitFor();
    await page.getByText('마지막 주문').first().waitFor();
    await noOverflow(page, name + ' 거래처 분석');
    await page.goto(base + '/#/health');
    await page.getByRole('heading', {name: '유통기한 임박 LOT'}).waitFor();
    await page.getByRole('heading', {name: '6개월간 판매 없는 재고'}).waitFor();
    await noOverflow(page, name + ' 재고 점검');

    // 저장된 보기
    await page.goto(base + '/#/forecast');
    await page.getByText('저장된 보기').waitFor();
    await page.getByLabel('보기 이름').fill('내 보기'); await page.getByRole('button', {name: '저장', exact: true}).click();
    await page.getByRole('button', {name: '내 보기', exact: true}).waitFor();
    await page.getByRole('button', {name: '내 보기 삭제'}).click();
    assert.equal(await page.getByRole('button', {name: '내 보기', exact: true}).count(), 0);

    // 어둡게: 배경이 실제로 어두워짐 + 가로 넘침 없음
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    if (name === '휴대폰') await page.getByRole('button', {name: '탐색 열기'}).click(); // 휴대폰은 메뉴를 열어야 화면 모드 버튼이 보임
    await page.getByRole('radio', {name: '어둡게'}).click();
    assert.notEqual(await bg(), light, '어두운 화면으로 바뀌지 않음');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    await noOverflow(page, name + ' 어두운 화면');
    assert.deepEqual(errors, [], name + ' 콘솔 오류');
    await page.close();
  }
  console.log('새 기능 e2e 통과');
} finally { await browser.close(); server.close(); }
