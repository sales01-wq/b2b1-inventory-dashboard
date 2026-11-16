// 상품 그룹 저장: 만들기 · 수정 · 삭제 · 거절 · 불러오기 · 권한 · 검사 (설정 저장소 kind 'skugroup' / 'skureject')
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

describe('상품 그룹 설정 저장', () => {
  const posts = [];
  let S, st, shared;
  const item = (pn, name, extra = {}) => ({품번: pn, 품명: name, 바코드: '', brand: '성분에디터', available: 0, incoming: 0, lastSale: null, ...extra});
  beforeAll(async () => {
    vi.resetModules();
    const mem = new Map();
    vi.stubGlobal('localStorage', {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)});
    vi.stubGlobal('document', {hidden: false, addEventListener() {}, getElementById: () => null});
    vi.stubGlobal('location', {hostname: 'app.example', protocol: 'https:'});
    vi.stubGlobal('fetch', async (url, opts = {}) => { if (opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return new Response('{"ok":true}', {status: 200}); } return new Response('{"items":[]}', {status: 200}); });
    st = await import('../lib/store.js'); S = await import('./settings.js'); ({shared} = await import('./shared.js'));
    Object.assign(shared, {active: true, token: 't', user: {email: 'u@corp.example', isUpdater: true}});
    st.state.salesRowsByProduct = new Map(); st.state.masterByProduct = new Map();
    st.state.forecast = [item('S1', '세럼 (북미)'), item('S2', '세럼 (글로벌)'), item('S3', '세럼 (북미/유럽)'), item('T1', '세럼 (TARGET)'), item('T2', '세럼 (TARGET 북미)'), item('J1', '세럼 (TJX)')];
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('후보 승인 = 그룹 만들기: 검사 통과하면 한 줄 저장, 대표 · 호환은 멤버 안으로 정리', async () => {
    posts.length = 0;
    const r = await S.createSkuGroup({name: '세럼', members: ['S1', 'S2', 'S3'], rep: 'S3', compat: ['S1', 'S3', 'ZZ']});
    expect(r.id).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual({kind: 'skugroup', key: r.id, value: {name: '세럼', members: ['S1', 'S2', 'S3'], rep: 'S3', compat: ['S1']}}); // 대표 본인 · 멤버 아닌 값 제외
    expect(st.settings.skuGroups[r.id].rep).toBe('S3');
  });
  it('거절: 고객 전용을 일반과 · TARGET 과 TJX 를 묶기, 다른 그룹에 있는 품번, 이름 없음, 1개', async () => {
    posts.length = 0;
    expect((await S.createSkuGroup({name: 'x', members: ['T1', 'S2']})).errors.join()).toMatch(/고객 전용/);
    expect((await S.createSkuGroup({name: 'x', members: ['T1', 'J1']})).errors.join()).toMatch(/고객 전용/);
    expect((await S.createSkuGroup({name: 'x', members: ['S1', 'S2']})).errors.join()).toMatch(/이미 다른 그룹에 속한 품번: S1/);
    expect((await S.createSkuGroup({name: '', members: ['T1', 'T2']})).errors.join()).toMatch(/이름/);
    expect((await S.createSkuGroup({name: 'x', members: ['T1']})).errors.join()).toMatch(/2개 이상/);
    expect(posts).toEqual([]); // 실패하면 저장하지 않음
    const ok = await S.createSkuGroup({name: 'TARGET 세럼', members: ['T1', 'T2']}); expect(ok.id).toBeTruthy(); // 같은 종류끼리는 가능
  });
  it('수정: 대표 수동 지정(판매 이력 없어도) · 호환 설정 · 멤버 편집 검사, 삭제', async () => {
    const id = Object.keys(st.settings.skuGroups).find(k => st.settings.skuGroups[k].name === '세럼');
    posts.length = 0;
    expect((await S.updateSkuGroup(id, {rep: 'S2', compat: ['S1', 'S3']})).id).toBe(id);
    expect(posts[0].value).toMatchObject({rep: 'S2', compat: ['S1', 'S3']});
    expect((await S.updateSkuGroup(id, {members: ['S1', 'S2', 'T1']})).errors.join()).toMatch(/고객 전용/); // 편집으로도 섞을 수 없음
    expect(st.settings.skuGroups[id].members).toEqual(['S1', 'S2', 'S3']); // 실패하면 그대로
    expect((await S.updateSkuGroup(id, {members: ['S1']})).errors.join()).toMatch(/2개 이상/);
    posts.length = 0; await S.deleteSkuGroup(id);
    expect(posts).toEqual([{kind: 'skugroup', key: id, value: null}]); expect(st.settings.skuGroups[id]).toBeUndefined();
  });
  it('후보 거절 저장(묶음) · 모두 되돌리기', async () => {
    posts.length = 0;
    await S.rejectSkuCandidate(['S2', 'S1']); await S.rejectSkuCandidate(['S1', 'S2']); // 순서 달라도 같은 후보
    expect(st.settings.skuRejected).toEqual(['S1+S2']);
    expect(posts.at(-1)).toEqual({kind: 'skureject', key: 'g0', value: ['S1+S2']});
    posts.length = 0; await S.clearSkuRejected();
    expect(posts).toEqual([{kind: 'skureject', key: 'g0', value: null}]);
  });
  it('서버 설정에서 불러오기 · 이 브라우저에도 저장 · 권한 없으면 변경 안 함', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({items: [
      {kind: 'skugroup', key: 'gx', value: {name: 'A', members: ['S1', 'S2'], rep: null, compat: []}},
      {kind: 'skureject', key: 'g0', value: ['Q1+Q2']}, {kind: 'skureject', key: 'g1', value: ['Q3+Q4']}]}), {status: 200}));
    await S.loadRemoteSettings();
    expect(Object.keys(st.settings.skuGroups)).toEqual(['gx']); expect(st.settings.skuRejected).toEqual(['Q1+Q2', 'Q3+Q4']); expect(st.settings.skuRejectedKeys).toEqual(['g0', 'g1']);
    const local = JSON.parse(localStorage.getItem('inv_settings_v1')); expect(local.skuGroups.gx.name).toBe('A');
    shared.user.isUpdater = false; vi.stubGlobal('fetch', async () => { throw new Error('호출되면 안 됨'); });
    expect((await S.createSkuGroup({name: 'n', members: ['T1', 'T2']})).errors[0]).toMatch(/권한자/);
    await S.deleteSkuGroup('gx'); expect(st.settings.skuGroups.gx).toBeDefined();
    shared.user.isUpdater = true;
  });
});
