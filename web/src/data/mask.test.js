// 마스크 품목 관리: 붙여넣기 해석 · 설정 저장(묶음) · 불러오기 · 서버 설정 API 가 'mask' 종류를 받는지
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

describe('마스크 품목 저장', () => {
  const posts = [];
  let S, V, shared, st;
  beforeAll(async () => {
    vi.resetModules();
    const mem = new Map();
    vi.stubGlobal('localStorage', {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)});
    vi.stubGlobal('document', {hidden: false, addEventListener() {}, getElementById: () => null});
    vi.stubGlobal('location', {hostname: 'app.example', protocol: 'https:'});
    vi.stubGlobal('fetch', async (url, opts = {}) => {
      if (opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ok: true}), {status: 200}); }
      return new Response(JSON.stringify({items: []}), {status: 200});
    });
    st = await import('../lib/store.js'); V = await import('../lib/views.js'); S = await import('./settings.js'); ({shared} = await import('./shared.js'));
    Object.assign(shared, {active: true, token: 't', user: {email: 'u@corp.example', isUpdater: true}});
    st.state.forecast = [{품번: 'MC1001', brand: '마미케어'}, {품번: 'SB2010', brand: '성분에디터'}];
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('붙여넣기 해석: 줄 · 탭 · 쉼표 · 공백, 중복 제거, 대소문자 맞춤, 형식 이상 · 데이터에 없는 품번 구분', () => {
    const r = V.maskInput('mc1001\tSB2010\r\nMC1001, ZZ9\n  \n=SUM(A1) MT3000;SB2010');
    expect(r.codes).toEqual(['MC1001', 'SB2010', 'ZZ9', 'MT3000']);
    expect(r.invalid).toEqual(['=SUM(A1)']); expect(r.notInData).toEqual(['ZZ9', 'MT3000']);
    expect(V.maskInput('').codes).toEqual([]);
  });
  it('추가 · 중복 · 삭제: 한 번 붙여넣기는 묶음 1줄만 저장, 삭제하면 다시 저장', async () => {
    posts.length = 0;
    expect(await S.addMaskCodes('MC1001\nSB2010\nMC1001')).toMatchObject({added: 2, existing: 0});
    expect(posts).toEqual([{kind: 'mask', key: 'g0', value: ['MC1001', 'SB2010']}]);
    expect(st.settings.mask).toEqual({MC1001: true, SB2010: true});
    expect(await S.addMaskCodes('SB2010 MT3000')).toMatchObject({added: 1, existing: 1});
    await S.removeMaskCode('MT3000');
    expect(Object.keys(st.settings.mask).sort()).toEqual(['MC1001', 'SB2010']);
    expect(JSON.parse(localStorage.getItem('inv_settings_v1')).mask).toEqual({MC1001: true, SB2010: true}); // 이 브라우저에도 저장
    expect((await S.addMaskCodes('   ')).error).toBe('추가할 품번을 입력해 주세요.');
  });
  it('많으면 120개씩 묶어 저장하고, 줄어들면 남는 묶음을 지움', async () => {
    const codes = Array.from({length: 250}, (_, i) => 'MK' + String(i).padStart(4, '0'));
    posts.length = 0; await S.clearMaskCodes(); posts.length = 0;
    await S.addMaskCodes(codes.join('\n'));
    expect(posts.map(p => [p.key, p.value.length])).toEqual([['g0', 120], ['g1', 120], ['g2', 10]]);
    posts.length = 0; await S.clearMaskCodes();
    expect(posts.map(p => [p.key, p.value])).toEqual([['g0', null], ['g1', null], ['g2', null]]); // 비우면 이전 묶음 모두 삭제
    expect(st.settings.mask).toEqual({});
  });
  it('업데이트 권한이 없으면 바꾸지 않음', async () => {
    shared.user.isUpdater = false; posts.length = 0;
    expect(await S.addMaskCodes('MC1001')).toEqual({error: null});
    expect(posts).toEqual([]); shared.user.isUpdater = true;
  });
  it('서버 설정에서 불러오기: 묶음 여러 줄을 합침', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({items: [{kind: 'mask', key: 'g0', value: ['A1', 'A2']}, {kind: 'mask', key: 'g1', value: ['B1']}, {kind: 'hero', key: 'SB1', value: {minQty: 5}}]}), {status: 200}));
    await S.loadRemoteSettings();
    expect(Object.keys(st.settings.mask).sort()).toEqual(['A1', 'A2', 'B1']); expect(st.settings.maskKeys).toEqual(['g0', 'g1']);
    expect(st.settings.hero.SB1).toEqual({minQty: 5});
  });
});

describe('api/settings.js: mask 종류', () => {
  it('업데이트 권한자만 저장, 배열 값 그대로 저장 · 읽기', async () => {
    const KEY = 'SECRET-GAS-KEY'; const sheet = [];
    Object.assign(process.env, {GOOGLE_CLIENT_ID: 'cid', ALLOWED_DOMAIN: 'corp.example', UPDATER_EMAILS: 'a@corp.example', GAS_URL: 'https://gas.example/exec', GAS_KEY: KEY});
    let email = 'a@corp.example';
    vi.stubGlobal('fetch', async url => {
      const u = String(url);
      if (u.includes('tokeninfo')) return new Response(JSON.stringify({aud: 'cid', iss: 'accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600), email, hd: 'corp.example', name: 'A'}), {status: 200});
      const p = Object.fromEntries(new URL(u).searchParams);
      if (p.action === 'settings_get') return new Response(JSON.stringify({items: sheet.map(r => ({kind: r[0], key: r[1], value: JSON.parse(r[2])}))}));
      const i = sheet.findIndex(r => r[0] === p.kind); if (i >= 0) sheet[i] = [p.kind, p.key, p.value]; else sheet.push([p.kind, p.key, p.value]);
      return new Response(JSON.stringify({ok: true}));
    });
    const handler = createRequire(import.meta.url)('../../../api/settings.js');
    const call = async (method, body) => { const res = {setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }}; await handler({method, headers: {authorization: 'Bearer t'}, body}, res); return res; };
    expect((await call('POST', {kind: 'mask', key: 'g0', value: ['MC1001', 'SB2010']})).code).toBe(200);
    expect((await call('GET')).body.items).toEqual([{kind: 'mask', key: 'g0', value: ['MC1001', 'SB2010']}]);
    email = 'b@corp.example'; expect((await call('POST', {kind: 'mask', key: 'g0', value: ['X1']})).code).toBe(403);
    vi.unstubAllGlobals();
  });
});
