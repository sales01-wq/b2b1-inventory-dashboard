// /api/settings ↔ (수정 전 원본 Apps Script 와 같은 동작을 하는 가짜) : 저장 → 다시 읽기가 항목마다 따로 되고, 인증 키가 브라우저로 나가지 않는지
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

const KEY = 'SECRET-GAS-KEY';
describe('설정 저장 (Apps Script 를 바꾸지 않은 상태)', () => {
  const sheet = [['hero', KEY, '{"min":9}', 'old@corp.example', 0]]; // 예전 버그로 적힌 줄: key 칸에 비밀 키
  let handler;
  const call = async (method, body) => {
    const res = {setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }};
    await handler({method, headers: {authorization: 'Bearer t'}, body}, res);
    return res;
  };
  beforeAll(() => {
    Object.assign(process.env, {GOOGLE_CLIENT_ID: 'cid', ALLOWED_DOMAIN: 'corp.example', UPDATER_EMAILS: 'a@corp.example', GAS_URL: 'https://gas.example/exec', GAS_KEY: KEY});
    vi.stubGlobal('fetch', async url => {
      const u = String(url);
      if (u.includes('tokeninfo')) return new Response(JSON.stringify({aud: 'cid', iss: 'accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600), email: 'a@corp.example', hd: 'corp.example', name: 'A'}), {status: 200});
      const p = Object.fromEntries(new URL(u).searchParams); // 원본 Code.gs: kind = p.kind, key = p.key (skey 는 읽지 않음)
      if (p.key !== KEY) return new Response(JSON.stringify({error: 'unauthorized'}));
      if (p.action === 'settings_get') return new Response(JSON.stringify({items: sheet.map(r => ({kind: r[0], key: r[1], value: JSON.parse(r[2]), by: r[3], at: r[4]}))}));
      const i = sheet.findIndex(r => r[0] === p.kind && r[1] === p.key);
      if (p.action === 'settings_del') { if (i >= 0) sheet.splice(i, 1); } else if (i >= 0) sheet[i] = [p.kind, p.key, p.value, p.by, 1]; else sheet.push([p.kind, p.key, p.value, p.by, 1]);
      return new Response(JSON.stringify({ok: true}));
    });
    handler = createRequire(import.meta.url)('../../../api/settings.js');
  });
  afterAll(() => vi.unstubAllGlobals());
  it('항목마다 따로 저장되고 그대로 다시 읽힘, 비밀 키는 응답에 없음', async () => {
    expect((await call('POST', {kind: 'hero', key: 'SB001', value: {min: 5, warn: 20}})).code).toBe(200);
    expect((await call('POST', {kind: 'hero', key: 'SB002', value: {min: 7}})).code).toBe(200);
    expect((await call('POST', {kind: 'box', key: 'SB001', value: {아웃W: 400}})).code).toBe(200);
    expect((await call('POST', {kind: 'rules', key: 'main', value: {riskDays: 45}})).code).toBe(200);
    const items = (await call('GET')).body.items.map(({kind, key, value}) => ({kind, key, value}));
    expect(items).toEqual(expect.arrayContaining([
      {kind: 'hero', key: 'SB001', value: {min: 5, warn: 20}}, {kind: 'hero', key: 'SB002', value: {min: 7}},
      {kind: 'box', key: 'SB001', value: {아웃W: 400}}, {kind: 'rules', key: 'main', value: {riskDays: 45}},
    ]));
    expect(items).toHaveLength(4); // 예전 버그로 적힌 줄은 버려짐
    expect(JSON.stringify(items)).not.toContain(KEY);
  });
  it('같은 항목을 다시 저장하면 덮어쓰고, 지우면 그 항목만 사라짐', async () => {
    await call('POST', {kind: 'hero', key: 'SB001', value: {min: 6}});
    await call('POST', {kind: 'hero', key: 'SB002', value: null});
    const items = (await call('GET')).body.items;
    expect(items.find(i => i.kind === 'hero' && i.key === 'SB001').value).toEqual({min: 6});
    expect(items.some(i => i.key === 'SB002')).toBe(false);
  });
});
