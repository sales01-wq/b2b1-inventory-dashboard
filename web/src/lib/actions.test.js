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
