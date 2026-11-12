// 실제 브라우저(Chromium)로 가짜 ERP 웹페이지에 로그인해서 엑셀 5개를 내려받는 전체 흐름 시험 (실제 ERP 접속 없음)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import XLSX from 'xlsx';
import erp from '../src/adapters/erp.js';
import mock from '../src/adapters/mock.js';
import {runOnce} from '../src/run.js';
import {FILES} from '../src/files.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const pw = createRequire(import.meta.url)('playwright');

async function fakeErp(files, {failMenu} = {}) {
  const logins = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/login') {
      if (req.method === 'POST') { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { logins.push(b); res.writeHead(302, {Location: '/home', 'Set-Cookie': 'sid=1'}); res.end(); }); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<form method=post><input id=id name=id><input id=pw name=pw type=password><button type=submit>로그인</button></form>');
    }
    if (!(req.headers.cookie || '').includes('sid=1')) { res.writeHead(302, {Location: '/login'}); return res.end(); }
    const m = u.pathname.match(/^\/export\/(\w+)$/);
    if (m) {
      if (failMenu === m[1]) { res.writeHead(500); return res.end('err'); }
      res.writeHead(200, {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="export.xlsx"'});
      return res.end(files.get(m[1]));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<a id=excel href="/export/${(u.searchParams.get('id') || 'x')}">엑셀</a>`);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return {base: `http://127.0.0.1:${srv.address().port}`, logins, close: () => new Promise(r => srv.close(r))};
}

const recipe = base => ({
  async login(page, cred) { await page.goto(base + '/login'); await page.fill('#id', cred.user); await page.fill('#pw', cred.password); await page.click('button[type=submit]'); await page.waitForURL('**/home'); },
  async download(page, def) { await page.goto(`${base}/menu?id=${def.id}`); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#excel')]); return dl; },
});

test('실제 브라우저로 로그인 → 5개 다운로드 → 검사 통과 → 묶음 업로드 (전체 흐름)', async () => {
  const files = await mock().fetchAll(FILES, NOW);
  const s = await fakeErp(files);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
  const config = {uploadFolder: path.join(root, 'up'), workDir: path.join(root, 'work'), timeoutMs: 8000}; fs.mkdirSync(config.uploadFolder);
  try {
    const adapter = erp(config, {playwright: pw, recipe: recipe(s.base), credential: {user: 'ro-user', password: 'pw-1'}});
    const r = await runOnce({config, adapter, now: NOW});
    assert.equal(r.result, 'published', String(r.error));
    assert.equal(s.logins.length, 1); assert.match(s.logins[0], /id=ro-user/);
    assert.deepEqual(fs.readdirSync(config.uploadFolder), [r.bundle]);
    const got = await adapter.fetchAll(FILES, NOW); // 다시 받아도 같은 내용 → 변경 없음
    assert.equal(got.size, 5);
    fs.rmSync(path.join(config.uploadFolder, r.bundle));
    assert.equal((await runOnce({config, adapter, now: new Date(NOW.getTime() + 1800e3)})).result, 'unchanged');
  } finally { await s.close(); }
});

test('다운로드 중 하나가 실패하면 아무것도 올리지 않고 오류만 기록', async () => {
  const files = await mock().fetchAll(FILES, NOW);
  const s = await fakeErp(files, {failMenu: 'sales2'});
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
  const config = {uploadFolder: path.join(root, 'up'), workDir: path.join(root, 'work'), timeoutMs: 5000}; fs.mkdirSync(config.uploadFolder);
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw, recipe: recipe(s.base), credential: {user: 'u', password: 'p'}}), now: NOW});
    assert.equal(r.result, 'error'); assert.deepEqual(fs.readdirSync(config.uploadFolder), []);
    assert.ok(JSON.parse(fs.readFileSync(path.join(config.workDir, 'state.json'), 'utf8')).lastError);
  } finally { await s.close(); }
});
