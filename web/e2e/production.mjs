// 운영 빌드 확인 (npm run e2e:production): 테스트 데이터 · 읽기 전용 없이 만든 일반 빌드(dist)를 운영처럼 localhost 가 아닌 주소로 열어서,
// 구글 로그인 화면이 먼저 나오고(업로드 화면 · 읽기 전용 배너 없음), /api 가 없으면 이유를 알려 주는지 확인합니다.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, normalize} from 'node:path';

const {chromium} = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { res.writeHead(200, {'Content-Type': TYPES[extname(path)] || 'text/html'}).end(await readFile(join(ROOT, path === '/' ? 'index.html' : path))); }
  catch { res.writeHead(404).end('not found'); }
}).listen(4186);
const base = 'http://prod.test:4186';
const browser = await chromium.launch({args: ['--host-resolver-rules=MAP prod.test 127.0.0.1']});
try {
  for (const apiOk of [true, false]) {
    const page = await browser.newPage();
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => {
      const u = r.request().url();
      if (r.request().method() !== 'GET') writes.push(u);
      if (u === base + '/api/config' && apiOk) return r.fulfill({json: {clientId: 'test-client', domain: 'example.com'}});
      return u.startsWith(base) && !u.includes('/api/') ? r.continue() : r.abort(); // 구글 · CDN · /api 는 막음
    });
    await page.goto(base + '/');
    if (apiOk) {
      await page.getByText('구글 로그인 스크립트를 불러오지 못했습니다').waitFor({timeout: 15000}); // 로그인 화면 (구글 스크립트는 막아 둠)
      assert.equal(await page.getByText('읽기 전용 미리보기').count(), 0);
      assert.equal(await page.getByText('Apps Script 웹앱 URL').count(), 0, '로그인 전에 업로드 화면이 보임');
    } else {
      await page.getByText('공유 데이터에 연결하지 못했습니다').waitFor({timeout: 15000});
      assert.equal(await page.getByText('읽기 전용 미리보기').count(), 0, '운영 빌드에 읽기 전용 배너');
    }
    assert.deepEqual(writes, [], '데이터를 바꾸는 요청이 나감');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('e2e 운영 빌드: 통과');
} finally { await browser.close(); server.close(); }
