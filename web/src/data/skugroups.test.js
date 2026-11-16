// 자동 그룹 제외 저장 · 저장된 그룹 설정 불러오기: 설정 저장소 kind 'skureject' / 'skugroup'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

describe('자동 그룹 제외(설정 저장)', () => {
  const posts = [];
  let S, st, shared;
  beforeAll(async () => {
    vi.resetModules();
    const mem = new Map();
    vi.stubGlobal('localStorage', {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)});
    vi.stubGlobal('document', {hidden: false, addEventListener() {}, getElementById: () => null});
    vi.stubGlobal('location', {hostname: 'app.example', protocol: 'https:'});
    vi.stubGlobal('fetch', async (url, opts = {}) => { if (opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return new Response('{"ok":true}', {status: 200}); } return new Response('{"items":[]}', {status: 200}); });
    st = await import('../lib/store.js'); S = await import('./settings.js'); ({shared} = await import('./shared.js'));
    Object.assign(shared, {active: true, token: 't', user: {email: 'u@corp.example', isUpdater: true}});
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('제외 = 정렬한 품번 키를 설정 저장소에 저장 (순서가 달라도 같은 키, 중복 없음) + 이 브라우저에도 저장', async () => {
    posts.length = 0;
    expect(await S.rejectSkuCandidate(['S2', 'S1'])).toEqual({ok: true}); await S.rejectSkuCandidate(['S1', 'S2']);
    expect(st.settings.skuRejected).toEqual(['S1+S2']);
    expect(posts.at(-1)).toEqual({kind: 'skureject', key: 'g0', value: ['S1+S2']});
    expect(JSON.parse(localStorage.getItem('inv_settings_v1')).skuRejected).toEqual(['S1+S2']);
  });
  it('60개씩 묶어 저장', async () => {
    posts.length = 0; st.settings.skuRejected = []; st.settings.skuRejectedKeys = [];
    for (let i = 0; i < 61; i++) st.settings.skuRejected.push('A' + i + '+B' + i);
    await S.rejectSkuCandidate(['X1', 'X2']);
    expect(posts.map(p => [p.key, p.value.length])).toEqual([['g0', 60], ['g1', 2]]);
    st.settings.skuRejected = []; st.settings.skuRejectedKeys = [];
  });
  it('업데이트 권한이 없으면 저장하지 않고 안내만', async () => {
    shared.user.isUpdater = false; posts.length = 0; const before = [...st.settings.skuRejected];
    expect((await S.rejectSkuCandidate(['P1', 'P2'])).error).toMatch(/권한자/); expect(posts).toEqual([]); expect(st.settings.skuRejected).toEqual(before);
    shared.user.isUpdater = true;
  });
  it('서버 저장 실패는 알리고(이 브라우저에는 저장됨)', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"x"}', {status: 500}));
    const r = await S.rejectSkuCandidate(['F1', 'F2']); expect(r.error).toMatch(/서버에 저장하지 못했습니다/); expect(st.settings.skuRejected).toContain('F1+F2');
  });
  it('저장된 수동 그룹 · 대표 · 호환 · 제외 목록을 서버 설정에서 그대로 불러옴', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({items: [
      {kind: 'skugroup', key: 'gx', value: {name: 'A', members: ['S1', 'S2'], rep: 'S2', compat: ['S1']}},
      {kind: 'skureject', key: 'g0', value: ['Q1+Q2']}, {kind: 'skureject', key: 'g1', value: ['Q3+Q4']}]}), {status: 200}));
    await S.loadRemoteSettings();
    expect(st.settings.skuGroups.gx).toEqual({name: 'A', members: ['S1', 'S2'], rep: 'S2', compat: ['S1']});
    expect(st.settings.skuRejected).toEqual(['Q1+Q2', 'Q3+Q4']); expect(st.settings.skuRejectedKeys).toEqual(['g0', 'g1']);
    expect(JSON.parse(localStorage.getItem('inv_settings_v1')).skuGroups.gx.rep).toBe('S2');
  });
});
