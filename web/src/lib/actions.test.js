// 팀 · 브랜드 버튼: 운영 화면의 버튼을 직접 눌러 본 결과와 actions.js 결과 비교
import {JSDOM} from 'jsdom';
import {describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadOracle, loadPort, canon} from './__fixtures__/harness.js';

const sh = makeSheets(NOW);
function load(a) {
  a.state.inventory = a.parseInventory(sh.inventory); a.state.schedule = a.parseSchedule(sh.schedule);
  a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)}; a.state.sales = a.salesForTeam();
  a.state.expiry = a.parseExpiry(sh.expiry); a.state.productMaster = a.parseProductMaster(sh.productMaster);
  a.computeDerived(); a.state.loaded = true;
}
const STEPS = [['team', '전체'], ['brand', '마미케어'], ['brand', '밀크터치'], ['team', 'B2B2팀'], ['brand', '마미케어'], ['team', 'B2B1팀']];
const snap = (a, ls) => canon({team: a.ui.team, brands: [...a.ui.brandSelected], fp: a.ui.forecastPage, cp: a.ui.customerPage, fc: a.ui.forecastCustomer,
  sales: a.state.sales.length, forecast: a.state.forecast, stored: ls.getItem('inv_team')});

describe('팀 · 브랜드 전환 = 운영 버튼 동작', () => {
  it('같은 순서로 눌렀을 때 상태가 같음', async () => {
    const o = loadOracle(), d = o.w.document;
    load(o.api); o.w.renderAll();
    const exp = [];
    for (const [k, v] of STEPS) {
      o.api.ui.forecastPage = 150; o.api.ui.customerPage = 100; o.api.ui.forecastCustomer = 'A상사';
      d.querySelector(k === 'team' ? `#teamToggle [data-team="${v}"]` : `#brandToggle [data-brand="${v}"]`).click();
      exp.push(snap(o.api, o.w.localStorage));
    }
    o.close();
    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
    const p = await loadPort(), a = p.api;
    globalThis.localStorage = new JSDOM('', {url: 'http://localhost/'}).window.localStorage;
    const {setTeam, toggleBrand} = await import('./actions.js');
    load(a);
    const act = [];
    for (const [k, v] of STEPS) {
      a.ui.forecastPage = 150; a.ui.customerPage = 100; a.ui.forecastCustomer = 'A상사';
      (k === 'team' ? setTeam : toggleBrand)(v);
      act.push(snap(a, globalThis.localStorage));
    }
    vi.useRealTimers();
    expect(act).toEqual(exp);
  });
});

describe('판매 현황 조작 = 운영 화면 조작', () => {
  // [설명, 운영 화면에서 할 일(w, d), 옮긴 쪽에서 할 일(act, a)]
  const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', {bubbles: true})); };
  const enter = (w, el, shift = false) => el.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', shiftKey: shift, bubbles: true, cancelable: true}));
  const STEPS = [
    ['거래처 검색', (w, d) => { d.getElementById('custMselTrigger').click(); type(w, d.getElementById('custMselSearch'), '상'); }, (x) => x.setCustMselSearch('상')],
    ['거래처 체크 A상사', (w, d) => d.querySelector('#custMselList input[data-key="A상사"]').click(), (x) => x.toggleCustomer('A상사', true)],
    ['검색 지우고 B유통 체크', (w, d) => { type(w, d.getElementById('custMselSearch'), ''); d.querySelector('#custMselList input[data-key="B유통"]').click(); }, (x) => { x.setCustMselSearch(''); x.toggleCustomer('B유통', true); }],
    ['더 보기', (w, d) => { w.eval('ui').customerPage = 1; w.renderCustomerTable(); d.querySelector('[data-action="customer-more"]').click(); }, (x, a) => { a.ui.customerPage = 1; x.customerMore(); }],
    ['품번 / 품명 검색', (w, d) => type(w, d.getElementById('customerPnSearch'), '세럼'), (x) => x.setCustomerPnSearch('세럼')],
    ['거래처 체크 해제 A상사', (w, d) => d.querySelector('#custMselList input[data-key="A상사"]').click(), (x) => x.toggleCustomer('A상사', false)],
    ['품번 붙여넣기 + Enter', (w, d) => { d.getElementById('pnMselTrigger').click(); const el = d.getElementById('pnMselSearch'); type(w, el, 'SB001, mc002  SB004'); enter(w, el); }, (x) => { x.setPnMselSearch('SB001, mc002  SB004'); x.pnEnter('SB001, mc002  SB004'); }], // 한 줄 입력칸: 줄바꿈은 브라우저가 지움
    ['빈 품번 Enter', (w, d) => { const el = d.getElementById('pnMselSearch'); type(w, el, '   '); enter(w, el); }, (x) => { x.setPnMselSearch('   '); x.pnEnter('   '); }],
    ['품번 검색 후 행 클릭', (w, d) => { type(w, d.getElementById('pnMselSearch'), 'mt'); d.querySelector('#pnMselList [data-key="MT002"]').click(); }, (x) => { x.setPnMselSearch('mt'); x.togglePn('MT002'); }],
    ['같은 행 다시 클릭', (w, d) => d.querySelector('#pnMselList [data-key="MT002"]').click(), (x) => x.togglePn('MT002')],
    ['칩 삭제', (w, d) => d.querySelector('#pnChipRow [data-key="mc002"]').click(), (x) => x.removePnChip('mc002')],
    ['거래처 선택 해제', (w, d) => d.querySelector('[data-action="msel-clear"][data-which="cust"]').click(), (x) => x.mselClear('cust')],
    ['품번 선택 해제', (w, d) => d.querySelector('[data-action="msel-clear"][data-which="pn"]').click(), (x) => x.mselClear('pn')],
    ['품목별 검색 + Enter', (w, d) => { const el = d.getElementById('skuStatusSearch'); type(w, el, '세럼, mc'); enter(w, el); }, (x, a) => { x.setSkuSearch('세럼, mc'); a.skuSearchMatches(); x.skuEnter(); }],
    ['Shift+Enter 는 선택 안 함', (w, d) => { const el = d.getElementById('skuStatusSearch'); type(w, el, 'sb00'); enter(w, el, true); }, (x, a) => { x.setSkuSearch('sb00'); a.skuSearchMatches(); }],
    ['검색 결과 행 클릭', (w, d) => d.querySelector('#skuStatusResults [data-pn="SB004"]').click(), (x) => x.toggleSku('SB004')],
    ['이 결과 전체 추가', (w, d) => d.querySelector('[data-action="pick-all-sku-status"]').click(), (x, a) => { a.skuSearchMatches(); x.pickAllSku(); }],
    ['선택 칩 삭제', (w, d) => d.querySelector('[data-action="remove-sku-status"][data-pn="SB001"]').click(), (x) => x.removeSku('SB001')],
    ['선택 전체 지우기', (w, d) => d.querySelector('[data-action="clear-sku-status"]').click(), (x) => x.clearSku()],
  ];
  const snap = a => canon({cust: [...a.ui.custSelected], pn: [...a.ui.pnSelected], page: a.ui.customerPage, cs: a.ui.custMselSearch, ps: a.ui.pnMselSearch,
    search: a.ui.customerPnSearch, sku: [...a.ui.skuStatusSelected], skuSearch: a.ui.skuStatusSearch});

  it('같은 순서로 조작했을 때 필터 상태가 같음', async () => {
    const o = loadOracle(), d = o.w.document;
    load(o.api); o.w.renderAll();
    const exp = STEPS.map(([name, run]) => { try { run(o.w, d); } catch (e) { throw new Error(name + ': ' + e.message); } return snap(o.api); });
    o.close();
    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
    const p = await loadPort(), a = p.api;
    const x = await import('./actions.js');
    load(a);
    const act = STEPS.map(([, , run]) => { run(x, a); return snap(a); });
    vi.useRealTimers();
    STEPS.forEach(([name], i) => expect([name, act[i]]).toEqual([name, exp[i]]));
    expect(exp[2].cust).toEqual(['A상사', 'B유통']);
    expect(exp[13].sku.length).toBeGreaterThan(1);
    expect(exp[3].page).toBe(51); expect(exp[4].page).toBe(50);
  });
});
