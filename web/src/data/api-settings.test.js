// /api/settings → Apps Script 호출: 설정 이름(skey)과 인증 키(key = GAS_KEY)가 섞이지 않는지
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

describe('api/settings.js 가 Apps Script 로 보내는 값', () => {
  const calls = [];
  beforeAll(() => {
    Object.assign(process.env, {GOOGLE_CLIENT_ID: 'cid', ALLOWED_DOMAIN: 'corp.example', UPDATER_EMAILS: 'a@corp.example', GAS_URL: 'https://gas.example/exec', GAS_KEY: 'SECRET-GAS-KEY'});
    vi.stubGlobal('fetch', async url => {
      const u = String(url);
      if (u.includes('tokeninfo')) return new Response(JSON.stringify({aud: 'cid', iss: 'accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600), email: 'a@corp.example', hd: 'corp.example', name: 'A'}), {status: 200});
      calls.push(new URL(u).searchParams);
      return new Response(JSON.stringify({ok: true}), {status: 200});
    });
  });
  afterAll(() => vi.unstubAllGlobals());
  it('설정 저장은 skey 로 항목 이름을 보내고 key 에는 GAS_KEY 만 담음', async () => {
    const handler = createRequire(import.meta.url)('../../../api/settings.js');
    const res = {headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() {}};
    await handler({method: 'POST', headers: {authorization: 'Bearer t'}, body: {kind: 'box', key: 'SB001', value: {아웃W: 400}}}, res);
    expect(res.code).toBe(200);
    const q = calls.at(-1);
    expect(q.get('action')).toBe('settings_set'); expect(q.get('kind')).toBe('box');
    expect(q.get('skey')).toBe('SB001'); expect(q.get('key')).toBe('SECRET-GAS-KEY'); // 이전에는 key 가 GAS_KEY 로 덮여 설정 이름이 사라졌음
    const d = {...res}; calls.length = 0;
    await handler({method: 'POST', headers: {authorization: 'Bearer t'}, body: {kind: 'box', key: 'SB001', value: null}}, {...d, status() { return this; }, json() { return this; }, setHeader() {}});
    expect(calls.at(-1).get('action')).toBe('settings_del'); expect(calls.at(-1).get('skey')).toBe('SB001');
  });
});
