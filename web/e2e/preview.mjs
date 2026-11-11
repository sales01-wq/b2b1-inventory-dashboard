// 미리보기 빌드 확인 (npm run e2e:preview): `npm run build:demo` 결과(dist-demo)를 Vercel 처럼 정적 파일로 띄우고,
// localhost 가 아닌 주소(preview.test)로 열어서 확인합니다: 로그인 화면 없이 테스트 데이터가 보이고, 데이터 요청은 모두 막힘.
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
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, {'Content-Type': TYPES[extname(path)] || 'text/html'}).end(body);
  } catch { res.writeHead(404).end('not found'); } // Vercel 처럼 /api 같은 없는 경로는 404
}).listen(4181);

const base = 'http://preview.test:4181';
const browser = await chromium.launch({args: ['--host-resolver-rules=MAP preview.test 127.0.0.1']});
try {
  for (const opts of [{viewport: {width: 1440, height: 900}}, {...devices['iPhone 13']}]) {
    const page = await browser.newPage(opts);
    const errors = [], dataRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith(base)) return r.continue();
      if (/script\.google\.com|\/api\//.test(u)) dataRequests.push(u);
      return r.abort(); // CDN(글꼴 · 라이브러리)은 오프라인 확인을 위해 막음
    });
    await page.goto(base + '/');
    await page.waitForURL(/#\/overview$/, {timeout: 10000});
    await page.getByText('미리보기 — 테스트 데이터입니다').waitFor();
    assert.equal(await page.getByText('로그인 정보를 확인하는 중입니다...').count(), 0);
    assert.match(await page.getByRole('main').innerText(), /SB004[\s\S]*재고 신호등/); // 테스트 데이터가 그려짐
    // 글꼴: CDN 을 모두 막은 상태에서도 앱에 포함된 Pretendard 가변 글꼴이 실제로 내려받아져 쓰임
    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Pretendard Variable' && f.status === 'loaded').length;
      return {loaded, family: getComputedStyle(document.querySelector('h1')).fontFamily};
    });
    assert.ok(font.loaded > 0, '불러온 Pretendard 글꼴 조각 없음');
    assert.match(font.family, /^"?Pretendard Variable/);
    // 앱 안에서 데이터 서버로 가는 요청은 모두 막힘 (운영 Apps Script 주소 포함)
    assert.match(await page.evaluate(() => fetch('/api/config').then(() => 'allowed', e => e.message)), /미리보기 모드/);
    assert.match(await page.evaluate(() => fetch('https://script.google.com/macros/s/x/exec').then(() => 'allowed', e => e.message)), /미리보기 모드/);
    await page.getByRole('button', {name: '새로고침'}).click(); // 새로고침 = 테스트 데이터 다시 적용
    await page.getByRole('cell', {name: 'SB004'}).waitFor(); // 다시 적용된 테스트 데이터
    if (process.env.SHOT_DIR) await page.screenshot({path: `${process.env.SHOT_DIR}/preview-${opts.viewport ? 'desktop' : 'mobile'}.png`});
    assert.deepEqual([errors, dataRequests], [[], []]);
  }
  console.log('e2e 미리보기 빌드 (preview.test): 통과');
} finally {
  await browser.close();
  server.close();
}
