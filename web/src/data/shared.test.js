// 데이터 연결 비교 테스트: 같은 가짜 서버(/api/*)를 상대로 운영 index.html 과 옮긴 src/data 가
// 같은 요청을 보내고, 같은 데이터 · 로그인 상태 · 안내 문구를 만드는지 확인합니다.
import zlib from 'node:zlib';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from '../lib/__fixtures__/sheets.js';
import {NOW, loadOracle, canon} from '../lib/__fixtures__/harness.js';

const sh = makeSheets(NOW);
const SHEETS = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적_B2B1팀: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({exp: NOW / 1000 + 3600, email: 'kim@example.com'})}.y`;
const WEBAPP = 'https://script.example/exec';

/** 가짜 서버. cfg 로 상황(버전 · 실패)을 바꾸고, 받은 요청을 log 에 남김 */
function makeServer() {
  const cfg = {at: 1000, by: 'lee@example.com', snapshot: 'ok', me: 'ok', settingsPost: 'ok', progress: [], auth: 'ok'};
  const log = [];
  const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json', ...headers}});
  const meta = () => ({snapshot: {at: cfg.at}, lastUpdate: {at: cfg.at, by: cfg.by}, sheets: Object.entries(SHEETS).map(([name, rows]) => ({name, rows: rows.length}))});
  async function fetch(url, init = {}) {
    const u = new URL(url, 'http://localhost'), auth = (init.headers || {}).Authorization;
    log.push([init.method || 'GET', u.pathname + u.search, auth ? auth.replace(TOKEN, 'TOKEN') : '', init.body || '']);
    if (u.origin + u.pathname === WEBAPP) {
      if (u.searchParams.get('action') === 'progress') return json(cfg.progress.shift() || {status: 'idle'});
      return json(SHEETS);
    }
    if (u.pathname === '/api/config') return json({clientId: 'cid', domain: 'example.com'});
    if (cfg.auth === 'expired' && u.pathname !== '/api/config') return json({error: 'expired'}, 401);
    if (u.pathname === '/api/me') return cfg.me === 'ok' ? json({email: 'kim@example.com', name: '김', isUpdater: true}) : json({error: 'domain', email: 'kim@gmail.com'}, 403);
    if (u.pathname === '/api/settings') {
      if (init.method === 'POST') return cfg.settingsPost === 'ok' ? json({ok: true}) : json({error: '시트 잠김'}, 502);
      return json({items: [{kind: 'rules', key: 'main', value: {leadDays: 50}}, {kind: 'hero', key: 'MT002', value: {minQty: 200}}, {kind: 'box', key: 'SB006', value: {아웃입수: 20}}]});
    }
    if (u.pathname === '/api/snapshot') {
      const m = encodeURIComponent(JSON.stringify({snapshot: {at: cfg.at}, lastUpdate: {at: cfg.at, by: cfg.by}}));
      if (cfg.snapshot === 'none') return json({error: 'no snapshot'}, 409);
      if (u.searchParams.get('have') === String(cfg.at)) return new Response(null, {status: 204, headers: {'X-Meta': m}});
      return new Response(zlib.gzipSync(JSON.stringify(SHEETS)), {status: 200, headers: {'X-Meta': m, 'Content-Type': 'application/octet-stream'}});
    }
    if (u.pathname === '/api/data') {
      const a = u.searchParams.get('action');
      if (a === 'meta') return json(meta());
      if (a === 'ensure' || a === 'update') return json({ok: true});
      if (a === 'progress') return json(cfg.progress.shift() || {status: 'done'});
      if (a === 'rows') { const from = +u.searchParams.get('from'), n = +u.searchParams.get('count'); return json({rows: SHEETS[u.searchParams.get('sheet')].slice(from, from + n)}); }
    }
    return json({error: 'unknown'}, 404);
  }
  return {cfg, log, fetch};
}

const fakeGoogle = calls => ({accounts: {id: {
  initialize: o => calls.push(['initialize', o.client_id, o.hd, o.auto_select]), renderButton: () => calls.push(['renderButton']),
  prompt: () => calls.push(['prompt']), disableAutoSelect: () => calls.push(['disableAutoSelect']),
}}});
const settle = async (isBusy, ms = 0) => { for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 10)); if (!isBusy()) break; } if (ms) await new Promise(r => setTimeout(r, ms)); };
const flat = s => String(s || '').replace(/\s+/g, '');
const noTiming = s => String(s || '').replace(/ · 화면 준비.*$/, '');

/** 두 쪽에 같은 순서로 수행하는 시나리오. env 는 각 쪽의 차이(화면에서 읽기 등)를 감춥니다. */
async function scenario(env) {
  const out = {}, {srv} = env;
  const snap = k => {
    out[k] = {
      log: srv.log.splice(0), bars: env.bars.splice(0), gate: env.gate(), user: canon(env.shared.user), token: env.shared.token ? 'set' : null,
      stored: env.stored(), active: env.shared.active, meta: canon(env.shared.meta), info: noTiming(env.info()), loaded: env.state.loaded,
      forecast: canon(env.state.forecast), settings: canon({rules: env.settings.rules, hero: env.settings.hero, box: env.settings.box}), // 마스크는 새 기능이라 운영 비교에서 제외 box: canon(env.ui.manualBoxInfo), sync: env.sync(), metaLine: env.metaLine(),
      google: env.calls.splice(0),
    };
  };
  // 1) 첫 접속: 저장된 로그인 + 저장본 없음 → 설정 · 저장본 받기
  env.localStorage.setItem('inv_idtoken', TOKEN);
  await env.init();
  await settle(() => env.shared.loading || !env.state.loaded);
  snap('1-login');
  // 2) 다시 확인: 같은 버전 → 204 (업데이트 기록만 바뀜)
  srv.cfg.by = 'park@example.com';
  await env.call('loadSharedData');
  snap('2-unchanged');
  // 3) 새 버전: 저장본 먼저 보여주고 '새 데이터' 알림 → 지금 적용
  srv.cfg.at = 2000;
  await env.call('loadSharedData');
  snap('3-pending');
  await env.clickBarAction();
  snap('3-applied');
  // 4) 2분마다 하는 새 데이터 확인
  srv.cfg.at = 3000;
  await env.call('checkForNewSharedData');
  snap('4-check');
  // 5) 업데이트 권한자의 새로고침: 진행률 → 완료 → 새로 받기
  srv.cfg.progress = [{status: 'processing', doneCount: 1, totalCount: 2, currentFile: 'erp_<b>1</b>.xlsx'}, {status: 'done'}];
  await env.call('sharedRefresh');
  snap('5-refresh');
  // 6) 저장본이 없을 때: 1,000행씩 나눠 받기
  srv.cfg.snapshot = 'none';
  await env.call('loadSharedData', {noCache: true, fresh: true});
  snap('6-fallback');
  srv.cfg.snapshot = 'ok';
  // 7) 설정 저장 성공 / 실패, 박스 정보 직접 입력 (0.7초 뒤 저장)
  await env.call('persistSetting', 'hero', 'SB001', {minQty: 10, warnQty: 0});
  srv.cfg.settingsPost = 'fail';
  await env.call('persistSetting', 'rules', 'main', null);
  srv.cfg.settingsPost = 'ok';
  env.call('setBoxDim', 'SB006', '아웃W', '600'); env.call('setBoxDim', 'SB006', '아웃입수', '0');
  await new Promise(r => setTimeout(r, 900));
  snap('7-settings');
  // 8) 로그인 만료 (401)
  srv.cfg.auth = 'expired';
  await env.call('loadSharedData', {noCache: true});
  snap('8-expired');
  srv.cfg.auth = 'ok';
  // 9) 회사 계정이 아님 (403)
  srv.cfg.me = 'forbidden';
  await env.call('onGoogleCredential', {credential: TOKEN});
  snap('9-forbidden');
  return out;
}

async function oracleEnv(srv) {
  const o = loadOracle(), w = o.w, d = w.document, bars = [], calls = [];
  Object.assign(w, {fetch: srv.fetch, Response, DecompressionStream, indexedDB: new IDBFactory(), google: fakeGoogle(calls)});
  const orig = w.setSharedBar;
  w.setSharedBar = (kind, html) => { const el = d.createElement('div'); el.innerHTML = html || ''; bars.push([kind, flat(el.textContent)]); orig(kind, html); };
  // 설정 저장 실패는 운영 화면이 setSharedBar 를 거치지 않고 같은 자리(#sharedBar)에 직접 씀
  const origErr = w.showSettingsError;
  w.showSettingsError = msg => { bars.push(['err', flat('설정 저장 실패: ' + msg)]); origErr(msg); };
  return {
    srv, bars, calls, localStorage: w.localStorage, shared: w.eval('shared'), state: o.api.state, ui: o.api.ui, get settings() { return o.api.settings; },
    init: async () => { d.documentElement.classList.add('gate'); await w.initSharedMode(); },
    call: (fn, ...args) => w[fn](...args),
    clickBarAction: async () => { d.querySelector('#sharedBar button').click(); await settle(() => false); },
    gate: () => [d.documentElement.classList.contains('gate'), d.getElementById('gateMsg').textContent, d.getElementById('gateMsg').className === 'err'],
    stored: () => w.localStorage.getItem('inv_idtoken') ? 'set' : null,
    info: () => d.getElementById('sharedInfoText').textContent,
    sync: () => { w.renderSyncStatus(); return d.getElementById('syncText').textContent; },
    metaLine: () => { w.renderMetaLine(); return d.getElementById('metaLine').textContent; },
    close: () => w.close(),
  };
}

async function portEnv(srv) {
  vi.resetModules();
  const W = new JSDOM('', {url: 'https://dashboard.example/'}).window, calls = [];
  Object.assign(globalThis, {window: globalThis, fetch: srv.fetch, indexedDB: new IDBFactory(), localStorage: W.localStorage, document: W.document, google: fakeGoogle(calls)});
  const store = await import('../lib/store.js'), views = await import('../lib/views.js');
  const data = await import('./shared.js'), settingsMod = await import('./settings.js');
  const bars = [];
  store.subscribe(() => {
    const b = data.shared.bar, key = b && [b.kind, flat([b.text, b.detail, b.action && b.action.label].filter(Boolean).join(''))];
    if (JSON.stringify(key) !== JSON.stringify(bars.last)) { bars.last = key; if (key) bars.push(key); }
  });
  const api = {...data, ...settingsMod};
  return {
    srv, bars, calls, localStorage: W.localStorage, shared: data.shared, state: store.state, ui: store.ui, get settings() { return store.settings; },
    init: async () => { data.shared.gated = true; await data.initSharedMode(); },
    call: (fn, ...args) => api[fn](...args),
    clickBarAction: async () => { data.shared.bar.action.run(); await settle(() => false); },
    gate: () => [data.shared.gated, data.shared.gate ? data.shared.gate.msg : '', !!(data.shared.gate && data.shared.gate.isErr)],
    stored: () => W.localStorage.getItem('inv_idtoken') ? 'set' : null,
    info: () => data.shared.infoText,
    sync: () => views.syncStatusText(data.shared),
    metaLine: () => views.metaLineText(),
    close: () => W.close(),
  };
}

describe('데이터 연결 = 운영 index.html', () => {
  let exp, act;
  beforeAll(async () => {
    const oe = await oracleEnv(makeServer());
    // 운영 화면은 bar 를 지울 때도 기록되므로, 옮긴 쪽과 같게 '지움'은 빼고 비교
    exp = await scenario(oe); oe.close();
    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
    const pe = await portEnv(makeServer());
    act = await scenario(pe); pe.close();
    // 의도한 차이(아래 테스트에서 따로 확인)를 맞춘 뒤 나머지를 그대로 비교
    act.raw5 = act['5-refresh'].bars;
    act['5-refresh'] = {...act['5-refresh'], bars: act.raw5.map(([k, t]) => [k, t.replace('erp_<b>1</b>', 'erp_1')])};
    vi.useRealTimers();
  }, 60000);
  afterAll(() => vi.useRealTimers());

  const STEPS = ['1-login', '2-unchanged', '3-pending', '3-applied', '4-check', '5-refresh', '6-fallback', '7-settings', '8-expired', '9-forbidden'];
  it('시나리오가 실제로 동작함', () => {
    expect(exp['1-login'].loaded).toBe(true);
    expect(exp['1-login'].forecast.length).toBeGreaterThan(5);
    expect(exp['6-fallback'].log.filter(l => l[1].includes('action=rows')).length).toBeGreaterThan(5);
    expect(exp['9-forbidden'].gate[1]).toContain('접근 권한이 없습니다');
  });
  it.each(STEPS)('%s', step => {
    const strip = x => ({...x, bars: x.bars.filter(([, t]) => t)});
    expect(strip(act[step])).toEqual(strip(exp[step]));
  });
  it('의도한 차이: 서버가 보낸 파일명은 HTML 로 해석하지 않고 글자 그대로 보여줌', () => {
    expect(exp['5-refresh'].bars).toContainEqual(['info', '파일처리중:erp_1.xlsx(1/2,50%)']);
    expect(act.raw5).toContainEqual(['info', '파일처리중:erp_<b>1</b>.xlsx(1/2,50%)']);
  });
});
