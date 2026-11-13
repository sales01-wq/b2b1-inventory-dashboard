// 읽기 전용 미리보기(VITE_READ_ONLY=1): 운영 데이터를 바꿀 수 있는 요청을 보내지 않는지 확인
import {afterAll, describe, expect, it, vi} from 'vitest';

describe('읽기 전용 미리보기', () => {
  afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
  it('설정 저장 · 업데이트 · 저장본 만들기 · Apps Script 호출을 보내지 않음 (읽기는 보냄)', async () => {
    vi.stubEnv('VITE_READ_ONLY', '1');
    vi.resetModules();
    const calls = [];
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => {}, removeItem: () => {}});
    vi.stubGlobal('document', {hidden: false, addEventListener() {}, getElementById: () => null});
    vi.stubGlobal('location', {hostname: 'preview.example', protocol: 'https:'});
    vi.stubGlobal('fetch', async (url, opts = {}) => {
      calls.push(`${opts.method || 'GET'} ${url}`);
      if (String(url).startsWith('/api/snapshot')) return new Response(JSON.stringify({error: 'no snapshot'}), {status: 409});
      return new Response(JSON.stringify({}), {status: 200, headers: {'Content-Type': 'application/json'}});
    });
    const {shared, sharedRefresh, refreshFromGoogleSheet} = await import('./shared.js');
    const {persistSetting} = await import('./settings.js');
    Object.assign(shared, {active: true, token: 'x', user: {email: 'u@example.com', isUpdater: true}});

    expect(await persistSetting('box', 'SB001', {아웃W: 400})).toEqual({ok: true, local: true});
    await sharedRefresh(); // 업데이트 권한자여도 서버 업데이트 대신 다시 받기만
    await new Promise(r => setTimeout(r, 20));
    shared.active = false; // 로그인 없는 업로드 모드의 '지금 가져오기' / 새로고침
    await refreshFromGoogleSheet('https://script.google.com/macros/s/x/exec');

    expect(calls.filter(c => c.startsWith('POST'))).toEqual([]);
    expect(calls.filter(c => /action=(update|ensure)|script\.google/.test(c))).toEqual([]);
    expect(calls.some(c => c.startsWith('GET /api/snapshot'))).toBe(true); // 읽기는 그대로
    expect(shared.gsStatus.text).toMatch(/읽기 전용 미리보기/);
  });
});

describe('공유 데이터 연결 진단', () => {
  const run = async fetchImpl => {
    vi.resetModules();
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => {}, removeItem: () => {}});
    vi.stubGlobal('document', {hidden: false, addEventListener() {}, getElementById: () => null});
    vi.stubGlobal('location', {hostname: 'preview.example', protocol: 'https:'});
    vi.stubGlobal('fetch', fetchImpl);
    const {shared, initSharedMode} = await import('./shared.js');
    await initSharedMode();
    return shared;
  };
  it('/api 가 없으면(404) 이유를 알려 주고 업로드 모드로', async () => {
    const s = await run(async () => new Response('nf', {status: 404}));
    expect(s.configProblem).toMatch(/api 폴더/); expect(s.gated).toBe(false);
  });
  it('GOOGLE_CLIENT_ID 가 비어 있으면 환경변수를 알려 줌', async () => {
    const s = await run(async () => new Response(JSON.stringify({clientId: '', domain: ''}), {status: 200}));
    expect(s.configProblem).toMatch(/GOOGLE_CLIENT_ID/);
  });
});

describe('web/api 는 저장소 루트 api 와 같은 코드를 가리킴', () => {
  it('모든 함수가 불러와지고 루트 api 와 같은 함수', async () => {
    const {createRequire} = await import('node:module');
    const req = createRequire(import.meta.url);
    for (const f of ['config', 'data', 'me', 'settings', 'snapshot']) {
      const shim = (await import(`../../api/${f}.js`)).default;
      expect(typeof shim).toBe('function');
      expect(String(shim)).toBe(String(req(`../../../api/${f}.js`))); // 같은 코드 (모듈 불러오기 방식만 다름)
    }
  });
});
