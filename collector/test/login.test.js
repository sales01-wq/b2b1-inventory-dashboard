// 자동 재로그인: 가짜 ERP 사이트(로그인 필요 모드)에서 실제 Chromium 으로 시험. 계정 정보는 로그 · 오류 · 상태 파일에 남지 않아야 함.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import erp from '../src/adapters/erp.js';
import mock from '../src/adapters/mock.js';
import {runOnce} from '../src/run.js';
import {authGuard} from '../src/auth.js';
import {FILES} from '../src/files.js';
import {NOW, fakeErp, setup} from './fake-erp.js';

const pw = createRequire(import.meta.url)('playwright');
const GOOD = {user: 'svc-erp', password: 'S3cret-Pw!x'};
const AUTH = {user: GOOD.user, pass: GOOD.password};

async function go(authOpts, {credential = GOOD, configExtra = {}, runs = 1} = {}) {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {auth: {...authOpts}});
  const config = {...setup(s), ...configExtra};
  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      const adapter = erp(config, {playwright: pw, credential});
      const r = await runOnce({config, adapter, now: new Date(NOW.getTime() + i * 1800e3)});
      results.push(r);
      for (const f of fs.readdirSync(config.uploadFolder)) fs.rmSync(path.join(config.uploadFolder, f)); // 앞 묶음은 처리된 것으로
    }
    return {s, config, results, r: results.at(-1)};
  } finally { await s.close(); }
}
const leaks = (config, results) => {
  const text = JSON.stringify(results) + fs.readdirSync(config.workDir).filter(f => /\.(json|log)$/.test(f)).map(f => fs.readFileSync(path.join(config.workDir, f), 'utf8')).join('\n');
  return [GOOD.password, 'wrong-pass-123'].filter(p => text.includes(p));
};

test('세션이 없으면 암호화 저장소의 계정으로 자동 로그인 → 5개 다운로드 → 묶음', async () => {
  const {s, config, results, r} = await go(AUTH);
  assert.equal(r.result, 'published', String(r.error));
  assert.equal(s.log.posts, 1);
  assert.deepEqual(leaks(config, results), []);
  assert.equal(authGuard(config.workDir).state().failures, 0);
});

test('도중에 세션이 끊기면 한 번 다시 로그인해서 이어서 받음', async () => {
  const {s, r} = await go({...AUTH, expireAfter: 2});
  assert.equal(r.result, 'published', String(r.error));
  assert.equal(s.log.posts, 2); // 처음 로그인 + 재로그인 1번
  assert.deepEqual(s.exports.filter(e => !e.startsWith('sales?') || e.includes('dept=')).map(e => e.split('?')[0]).filter((e, i, a) => a.indexOf(e) === i), ['inventory', 'wms', 'sales', 'schedule']);
});

test('비밀번호가 틀리면 2번만 시도하고 계정 잠금 방지로 멈춤 · 비밀번호는 어디에도 안 남음 · reset 후 재개', async () => {
  const bad = {user: GOOD.user, password: 'wrong-pass-123'};
  const {s, config, results} = await go(AUTH, {credential: bad, runs: 3});
  assert.deepEqual(results.map(r => r.result), ['error', 'error', 'error']);
  assert.match(results[0].error, /로그인에 실패/);
  assert.match(results[2].error, /자동 로그인 중단: 연속 2회 실패/);
  assert.equal(s.log.posts, 2); // 세 번째는 ERP 에 시도조차 하지 않음
  assert.deepEqual(leaks(config, results), []);
  authGuard(config.workDir).reset();
  const s2 = await fakeErp(await mock().fetchAll(FILES, NOW), {auth: {...AUTH}});
  try {
    const r = await runOnce({config: {...config, erpUrl: s2.base}, adapter: erp({...config, erpUrl: s2.base}, {playwright: pw, credential: GOOD}), now: NOW});
    assert.equal(r.result, 'published', String(r.error));
  } finally { await s2.close(); }
});

test('CAPTCHA 가 있으면 제출하지 않고 안전하게 중단 (우회 안 함)', async () => {
  const {s, r} = await go({...AUTH, captcha: true});
  assert.equal(r.result, 'error'); assert.match(r.error, /CAPTCHA/); assert.equal(s.log.posts, 0);
});

test('로그인 후 추가 인증(OTP 등)이 나오면 중단', async () => {
  const {s, r, config, results} = await go({...AUTH, mfa: true});
  assert.equal(r.result, 'error'); assert.match(r.error, /추가 인증/); assert.equal(s.log.posts, 1);
  assert.deepEqual(leaks(config, results), []);
});

test('입력칸이 여러 개라 아이디 칸이 모호하면 제출하지 않고 중단, 선택자를 지정하면 진행', async () => {
  const a = await go({...AUTH, twoText: true});
  assert.equal(a.r.result, 'error'); assert.match(a.r.error, /로그인 입력칸이 2개/); assert.equal(a.s.log.posts, 0);
  const b = await go({...AUTH, twoText: true}, {configExtra: {login: {userSelector: '[name=id]'}}});
  assert.equal(b.r.result, 'published', String(b.r.error));
});

test('오류 문구에 계정 정보가 섞이면 가려서 내보냄', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {auth: {...AUTH}});
  const config = setup(s);
  try {
    const recipe = {login: async (page, cred) => { throw new Error(`실패 user=${cred.user} pw=${cred.password}`); }, download: async () => null};
    const r = await runOnce({config, adapter: erp(config, {playwright: pw, credential: GOOD, recipe}), now: NOW});
    assert.equal(r.result, 'error'); assert.equal(r.error, '실패 user=*** pw=***');
    assert.deepEqual(leaks(config, [r]), []);
  } finally { await s.close(); }
});
