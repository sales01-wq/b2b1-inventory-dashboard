// 녹화한 ERP 동작(src/recipe.js)을 실제 Chromium 으로 "ERP 와 같은 구조의 가짜 사이트"에서 실행 (실제 ERP 접속 없음). 가짜 사이트는 fake-erp.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import erp from '../src/adapters/erp.js';
import mock from '../src/adapters/mock.js';
import {runOnce} from '../src/run.js';
import {FILES} from '../src/files.js';
import {NOW, fakeErp, setup} from './fake-erp.js';

const pw = createRequire(import.meta.url)('playwright');

test('녹화한 흐름 그대로: 5개 다운로드 → 검사 통과 → 묶음 (판매실적은 시작일 1월 1일 · 부서 첫째/둘째 줄)', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW));
  const config = setup(s);
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw}), now: NOW}); // 자격증명 없이 (세션 있는 경우)
    assert.equal(r.result, 'published', String(r.error) + ' ' + s.exports.join(' | '));
    assert.deepEqual(s.exports.map(e => e.split('?')[0]), ['inventory', 'wms', 'sales', 'sales', 'schedule']);
    assert.ok(s.exports[2].includes('dept=B2B1') && s.exports[3].includes('dept=B2B2'));
    assert.ok(s.exports.slice(2, 4).every(e => e.includes('start=2026-01-01')));
    assert.deepEqual(fs.readdirSync(config.uploadFolder), [r.bundle]);
  } finally { await s.close(); }
});

test('시작일이 1월 1일이 아니면 중단하고 아무것도 올리지 않음', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {badDay: true});
  const config = setup(s);
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw}), now: NOW});
    assert.equal(r.result, 'error'); assert.match(r.error, /시작일이 '2026-01-15'/);
    assert.deepEqual(fs.readdirSync(config.uploadFolder), []);
  } finally { await s.close(); }
});

test('로그인 화면이 아닌 낯선 화면이면 자격증명을 열지 않고 중단', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {loggedOut: true});
  const config = {...setup(s), timeoutMs: 8000};
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw, credential: null}), now: NOW});
    assert.equal(r.result, 'error'); assert.match(r.error, /로그인 화면을 알아볼 수 없어/);
    assert.deepEqual(fs.readdirSync(config.uploadFolder), []);
  } finally { await s.close(); }
});
