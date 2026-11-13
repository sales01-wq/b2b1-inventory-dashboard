// 새 화면 계산 테스트: 월별 판매 · 거래처 분석 · 재고 점검 · 발주 목록 · 저장된 보기
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, I;
beforeAll(async () => {
  const mem = new Map(); globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  a = (await loadPort()).api; I = await import('./insights.js');
  const sh = makeSheets(NOW);
  a.state.inventory = a.parseInventory(sh.inventory);
  a.state.schedule = a.parseSchedule(sh.schedule);
  a.state.scheduleMonthLabels = a.state.schedule.monthLabels;
  a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)};
  a.state.sales = a.salesForTeam();
  a.state.expiry = a.parseExpiry(sh.expiry);
  a.state.productMaster = a.parseProductMaster(sh.productMaster);
  a.computeDerived(); a.state.loaded = true;
});
afterAll(() => vi.useRealTimers());

describe('월별 판매', () => {
  it('12개월, 합계는 같은 기간 판매 수량의 합', () => {
    const pn = a.state.forecast.find(x => x.sold6 > 0).품번;
    const m = I.monthlySales(pn);
    expect(m).toHaveLength(12);
    const from = new Date(NOW); from.setMonth(from.getMonth() - 11, 1); from.setHours(0, 0, 0, 0);
    const want = a.state.sales.filter(s => s.품번 === pn && s.실적일자 >= from).reduce((t, s) => t + s.수량, 0);
    expect(m.reduce((t, x) => t + x.qty, 0)).toBe(want);
  });
  it('소진 예상일: 판매 없으면 null', () => {
    expect(I.depletionDays(100, 0)).toBeNull();
    expect(I.depletionDays(91, 91.25)).toBe(91);
  });
});

describe('거래처 분석', () => {
  it('거래처마다 한 행, 경과일은 마지막 주문일 기준, 반품은 제외', () => {
    const rows = I.customerAnalysis();
    expect(new Set(rows.map(r => r.거래처)).size).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(r => expect(r.daysSince).toBe(Math.max(0, Math.round((+new Date(NOW) - r.lastOrder.getTime()) / 86400000))));
    expect(rows[0]).not.toHaveProperty('next'); // 주문 주기 예측은 하지 않음
  });
});

describe('재고 점검', () => {
  it('무판매 재고는 6개월 판매 0 이면서 재고가 있는 품목', () => {
    const h = I.inventoryHealth();
    h.idle.forEach(x => { expect(x.sold6).toBe(0); expect(x.available).toBeGreaterThan(0); });
    h.slow.forEach(x => expect(x.days).toBeGreaterThan(365));
  });
  it('유통기한: 기간이 길수록 같거나 더 많이 나옴, 남은 일수 오름차순', () => {
    const s = I.inventoryHealth(90).expiring, l = I.inventoryHealth(365).expiring;
    expect(l.length).toBeGreaterThanOrEqual(s.length);
    l.forEach((e, i) => { expect(e.daysLeft).toBeLessThanOrEqual(365); if (i) expect(e.daysLeft).toBeGreaterThanOrEqual(l[i - 1].daysLeft); });
  });
});

describe('발주 목록 · 저장된 보기 · 검색', () => {
  it('담기 · 수정 · 빼기 · CSV', () => {
    const x = a.state.forecast.find(f => f.orderQty > 0);
    I.addToCart(x.품번);
    expect(a.ui.cart.get(x.품번)).toBe(x.orderQty);
    I.setCartQty(x.품번, '1,200');
    expect(a.ui.cart.get(x.품번)).toBe(1200);
    const {csv} = I.cartCsv();
    expect(csv.startsWith('﻿품번,')).toBe(true);
    expect(csv).toContain(`${x.품번},`);
    expect(csv).toContain(',1200');
    I.setCartQty(x.품번, 0);
    expect(a.ui.cart.size).toBe(0);
  });
  it('저장된 보기: 저장 · 적용 · 삭제', () => {
    a.ui.forecastGrade = '위험'; a.ui.forecastSearch = 'MT';
    I.saveView('테스트');
    a.ui.forecastGrade = ''; a.ui.forecastSearch = '';
    I.applyView('테스트');
    expect(a.ui.forecastGrade).toBe('위험'); expect(a.ui.forecastSearch).toBe('MT');
    I.deleteView('테스트');
    expect(I.savedViews()).toHaveLength(0);
  });
  it('검색: 품번 · 품명 · 바코드', () => {
    const x = a.state.forecast[0];
    expect(I.searchProducts(x.품번.slice(0, 4)).some(r => r.품번 === x.품번)).toBe(true);
    expect(I.searchProducts('')).toEqual([]);
  });
});

describe('성능: 판매실적 6만 줄 · 거래처 300곳', () => {
  it('새 계산은 모두 합쳐서 1초 안', () => {
    const base = a.state.sales.slice(), pns = a.state.forecast.map(x => x.품번);
    const big = [];
    for (let i = 0; i < 60000; i++) big.push({거래처: '거래처' + (i % 300), 품번: pns[i % pns.length], 품명: '', 수량: 1 + (i % 9), 실적일자: new Date(+new Date(NOW) - (i % 700) * 86400000), 금액: 1000});
    a.state.sales = big;
    const t = performance.now();
    I.customerAnalysis(); I.inventoryHealth(); I.totalMonthlySales(); I.monthlySales(pns[0]);
    const ms = performance.now() - t;
    a.state.sales = base;
    expect(ms).toBeLessThan(1000);
  });
});
