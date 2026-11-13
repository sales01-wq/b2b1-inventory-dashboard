// 운영 데이터 모양의 이상값(마이너스 재고 · 빈 값 · NaN · 잘못된 날짜 · 거래처 없음)이 들어와도 발주 현황 계산이 예외 없이 끝나는지
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, I;
const NOWD = new Date(NOW);
const inMonth = (back, day = 10) => new Date(NOWD.getFullYear(), NOWD.getMonth() - back, day);
beforeAll(async () => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  const mem = new Map(); globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  a = (await loadPort()).api; I = await import('./insights.js');
  const sh = makeSheets(NOW);
  a.state.inventory = a.parseInventory(sh.inventory);
  a.state.schedule = a.parseSchedule(sh.schedule);
  a.state.scheduleMonthLabels = a.state.schedule.monthLabels;
  a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)};
  a.state.expiry = a.parseExpiry(sh.expiry);
  a.state.productMaster = a.parseProductMaster(sh.productMaster);
  a.state.loaded = true;
});
afterAll(() => vi.useRealTimers());

const BAD_SALES = [
  {거래처: undefined, 품번: 'SB001', 품명: '', 수량: 50, 실적일자: inMonth(1), 금액: 0},
  {거래처: null, 품번: 'SB001', 품명: undefined, 수량: 20, 실적일자: inMonth(2), 금액: undefined},
  {거래처: '', 품번: 'SB002', 품명: '', 수량: NaN, 실적일자: inMonth(1), 금액: 0},
  {거래처: 'A', 품번: 'SB002', 품명: '', 수량: undefined, 실적일자: inMonth(1), 금액: 0},
  {거래처: 'A', 품번: 'SB002', 품명: '', 수량: '30', 실적일자: inMonth(1), 금액: 0},
  {거래처: 'A', 품번: 'SB004', 품명: '', 수량: 10, 실적일자: new Date(NaN), 금액: 0},
  {거래처: 'A', 품번: 'SB004', 품명: '', 수량: 10, 실적일자: undefined, 금액: 0},
  {거래처: 'A', 품번: 'SB004', 품명: '', 수량: Infinity, 실적일자: inMonth(1), 금액: 0},
  {거래처: 'A', 품번: 'MC001', 품명: '', 수량: -500, 실적일자: inMonth(1), 금액: 0}, // 반품만 있는 품목
  {거래처: 'A', 품번: 'sb003', 품명: '', 수량: 5, 실적일자: inMonth(1), 금액: 0}, // 소문자 품번
];
function loadBad() {
  a.state.inventory = a.state.inventory.map((r, i) => ({...r, 가용재고: [-40, NaN, undefined, null, '12'][i % 5] ?? r.가용재고, 창고: i % 7 === 0 ? undefined : r.창고}));
  a.state.schedule = a.state.schedule.map((r, i) => (i % 2 ? {...r, aug_d: undefined, aug_q: NaN, sep_d: '날짜아님', sep_q: -5, 품목상태: undefined, 품명: undefined, 바코드: undefined} : r));
  a.state.sales = BAD_SALES.filter(r => r.실적일자 === undefined || r.실적일자 instanceof Date).map(r => r); // 잘못된 날짜도 그대로 넣음
  a.settings.hero = {SB001: {min: 9}, SB002: {minQty: 'x'}, MC001: null}; a.settings.rules = {leadDays: 60, urgentDays: 30, riskPct: 'abc'}; // 예전 형식 · 깨진 설정
  a.computeDerived();
}

describe('이상값이 섞인 운영 모양 데이터', () => {
  it('계산이 예외 없이 끝나고 모든 값이 유한한 숫자', () => {
    expect(() => loadBad()).not.toThrow();
    a.state.forecast.forEach(x => {
      ['available', 'incoming', 'target', 'orderQty'].forEach(k => expect(Number.isFinite(x[k]), `${x.품번}.${k}=${x[k]}`).toBe(true));
      expect(x.orderQty).toBeGreaterThanOrEqual(0);
    });
  });
  it('화면이 쓰는 모든 모델이 예외 없이 나옴 (필터 · 거래처 · 상세 · 분포 · 탭)', () => {
    loadBad();
    for (const grade of ['조치필요', '위험', '주의', '여유', '참고', '', '과잉재고']) for (const cust of ['', 'A', '없는거래처']) {
      Object.assign(a.ui, {forecastGrade: grade, forecastCustomer: cust, forecastShowNoSales: true});
      const m = a.forecastModel();
      m.list.forEach(x => { a.forecastDetail(x); m.monthly(x); expect(() => a.statusLabel(x.grade)).not.toThrow(); });
    }
    a.ui.forecastCustomer = '';
    expect(() => { a.coverageBands(); a.customerShortRows(); a.overviewModel(); a.urgentItems(); a.rulesModel(); a.forecastListCsv(); }).not.toThrow();
    a.state.forecast.forEach(x => { I.productDetail(x.품번); a.expiryRows(x.품번); a.warehouseRows(x.품번); });
    expect(() => { I.customerAnalysis(); I.inventoryHealth(); I.totalMonthlySales(); I.searchProducts('sb'); I.cartRows(); }).not.toThrow();
  });
  it('마이너스 재고(비율 < 0)도 분포에 들어감 — 전체 품목 수와 합이 맞음', () => {
    loadBad();
    const {bands, ref} = a.coverageBands();
    expect(bands.reduce((s, b) => s + b.n, 0) + ref).toBe(a.state.forecast.filter(x => a.brandPasses(x.brand) && !x.hero).length);
  });
  it('반품만 있는 품목은 판매 없음(참고), 목표 0', () => {
    loadBad();
    const x = a.state.forecast.find(f => f.품번 === 'MC001');
    expect(x.target).toBe(0); expect(x.grade).toBe('데이터부족');
  });
});
