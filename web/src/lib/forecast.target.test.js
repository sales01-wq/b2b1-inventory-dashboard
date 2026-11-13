// 발주 현황 계산(목표 재고 방식): 최근 12개월(이번 달 제외) 월별 합계 최대값 = 목표, 부족 = max(0, 목표 − 가용 − 유효 입고예정), 위험 판정도 같은 비율
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, A;
const NOWD = new Date(NOW);
const inMonth = (back, day = 10) => new Date(NOWD.getFullYear(), NOWD.getMonth() - back, day); // back=1 → 지난달
const row = (cust, pn, qty, d) => ({거래처: cust, 품번: pn, 품명: pn, 수량: qty, 실적일자: d, 금액: 0});
const item = pn => a.state.forecast.find(x => x.품번 === pn);

beforeAll(async () => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  const mem = new Map(); globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  a = (await loadPort()).api; A = a;
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
const run = sales => { a.state.sales = sales; a.settings.hero = {}; a.settings.rules = {}; a.computeDerived(); };

describe('목표 재고 = 최근 12개월 중 모든 거래처 합계 월 판매 최대', () => {
  it('거래처를 합쳐서 월별로 모으고 가장 큰 달을 목표로', () => {
    run([row('A', 'SB004', 30, inMonth(2)), row('B', 'SB004', 50, inMonth(2, 20)), row('A', 'SB004', 60, inMonth(5)), row('A', 'SB004', 10, inMonth(8))]);
    const x = item('SB004');
    expect(x.target).toBe(80); // 2달 전: A30 + B50
    expect(x.monthTotals.reduce((s, v) => s + v, 0)).toBe(150);
  });
  it('이번 달과 12개월 이전 판매는 제외', () => {
    run([row('A', 'SB004', 999, inMonth(0, 1)), row('A', 'SB004', 999, inMonth(13)), row('A', 'SB004', 20, inMonth(12)), row('A', 'SB004', 10, inMonth(1))]);
    expect(item('SB004').target).toBe(20); // 12달 전(가장 오래된 완료 월)은 포함
  });
  it('반품 · 마이너스 조정은 따로 모으고 목표에서 빼지 않음', () => {
    run([row('A', 'SB004', 100, inMonth(3)), row('A', 'SB004', -40, inMonth(3, 15)), row('A', 'SB004', 30, inMonth(1))]);
    const x = item('SB004');
    expect(x.target).toBe(100); expect(x.returns).toBe(40);
  });
});

describe('부족 수량 · 유효 입고예정', () => {
  it('부족 = max(0, 목표 − 가용 − 유효 입고예정), 날짜가 지난 입고예정은 제외', () => {
    run([row('A', 'SB005', 500, inMonth(1))]);
    const x = item('SB005'); // 가용 0, 입고예정 100 (10일 뒤)
    expect(x.available).toBe(0); expect(x.incoming).toBe(100); expect(x.orderQty).toBe(400);
    const past = a.validIncoming({aug_d: '2020-01-01', aug_q: 70, sep_d: '', sep_q: 5, oct_d: '2999-01-01', oct_q: 9});
    expect(past).toEqual({valid: 14, excluded: 70});
  });
  it('재고가 충분하면 0 (음수 없음)', () => {
    run([row('A', 'SB001', 10, inMonth(1))]);
    expect(item('SB001').orderQty).toBe(0);
  });
});

describe('위험 판정과 부족 수량의 일관성', () => {
  const R = () => a.getRules().riskPct;
  it('비율 구간: 100% 이상 여유 · 위험 기준 미만 위험 · 사이 주의 · 판매 없음 참고', () => {
    const base = [row('A', 'MC001', 1000, inMonth(1))]; // 목표 1000, 가용 99000 → 여유
    run(base); expect(item('MC001').grade).toBe('안전');
    run([row('A', 'SB002', 100, inMonth(1))]); // 가용 20 → 20% → 위험
    expect(item('SB002').grade).toBe('위험'); expect(item('SB002').orderQty).toBe(80);
    run([row('A', 'SB004', 100, inMonth(1))]); // 가용 60 → 60% → 주의 (기본 위험 기준 50%)
    expect(item('SB004').grade).toBe('주의');
    run([]); expect(item('SB004').grade).toBe('데이터부족'); expect(item('SB004').orderQty).toBe(0);
    expect(R()).toBe(50);
  });
  it('위험 기준을 바꾸면 경계가 바뀜', () => {
    run([row('A', 'SB004', 100, inMonth(1))]);
    a.settings.rules = {riskPct: 70}; a.computeDerived();
    expect(item('SB004').grade).toBe('위험'); // 60% < 70%
  });
  it('모든 품목에서: 부족 수량이 있으면 위험/주의, 없으면 여유/참고 (히어로 제외)', () => {
    run([row('A', 'SB001', 5000, inMonth(2)), row('B', 'SB002', 100, inMonth(1)), row('A', 'MT001', 800, inMonth(4)), row('C', 'MC002', 3000, inMonth(1)), row('A', 'SB004', 100, inMonth(1))]);
    a.state.forecast.forEach(x => {
      if (x.hero) return;
      if (x.orderQty > 0) expect(['위험', '주의']).toContain(x.grade);
      else expect(['안전', '데이터부족']).toContain(x.grade);
    });
  });
  it('분포 구간 개수가 전체 품목 수와 같음', () => {
    const {bands, ref} = a.coverageBands();
    expect(bands.reduce((s, b) => s + b.n, 0) + ref).toBe(a.state.forecast.filter(x => a.brandPasses(x.brand) && !x.hero).length);
  });
});

describe('대량 판매 확인 (제외하지 않고 표시)', () => {
  it('가장 큰 달이 두 번째의 2배 이상이면 표시하고 목표에는 그대로 포함', () => {
    run([row('A', 'SB004', 1000, inMonth(2)), row('B', 'SB004', 100, inMonth(4)), row('B', 'SB004', 90, inMonth(6))]);
    const x = item('SB004');
    expect(x.target).toBe(1000);
    expect(x.spike).toMatchObject({qty: 1000, second: 100, oneMonth: false});
    expect(x.spike.customers[0]).toEqual({cust: 'A', qty: 1000});
  });
  it('고르게 팔리면 표시 없음, 한 달뿐이면 표시', () => {
    run([row('A', 'SB004', 100, inMonth(2)), row('A', 'SB004', 90, inMonth(4))]);
    expect(item('SB004').spike).toBeNull();
    run([row('A', 'SB004', 100, inMonth(2))]);
    expect(item('SB004').spike.oneMonth).toBe(true);
  });
});

describe('화면 용어', () => {
  it('위험 → 생산 필요, 주의 → 생산 추천, 여유 · 참고 그대로 (계산 등급 키는 그대로)', () => {
    expect(['위험', '주의', '안전', '데이터부족'].map(a.statusLabel)).toEqual(['생산 필요', '생산 추천', '여유', '참고']);
    run([row('A', 'SB002', 100, inMonth(1))]);
    expect(item('SB002').grade).toBe('위험');
    a.ui._forecastCsvRows = [item('SB002')];
    expect(a.forecastListCsv().csv).toContain(',생산 필요,');
    expect(a.gradeChips === undefined && a.forecastModel().gradeChips.map(c => c[1])).toEqual(['생산 필요 + 추천', '생산 필요', '생산 추천', '여유', '참고', '미판매', '전체']);
  });
});

describe('단종 품목', () => {
  it('제품일정표에서 단종이면 참고, 부족 수량 0 (이유는 화면에 표시)', () => {
    run([row('A', 'SB003', 500, inMonth(1))]); // 단종 토너 (가용 5)
    expect(item('SB003')).toMatchObject({discontinued: true, grade: '데이터부족', orderQty: 0});
  });
});

describe('거래처별 보기', () => {
  it('거래처마다 구매 품목 수와 부족 품목 수 (수량은 합치지 않음)', () => {
    run([row('A', 'SB002', 100, inMonth(1)), row('A', 'SB004', 100, inMonth(1)), row('B', 'SB002', 50, inMonth(2))]);
    const rows = a.customerShortRows();
    expect(rows.find(r => r.cust === 'A')).toMatchObject({items: 2, short: 2});
    expect(rows.find(r => r.cust === 'B')).toMatchObject({items: 1, short: 1});
  });
});

describe('거래처 다중 선택 · 연도별 월 판매 · 일괄 선택 · 목표 기준 월', () => {
  const I = () => import('./insights.js');
  it('월별 판매: 선택 연도의 1~12월, 0 은 0 (화면에서 -), 거래처를 고르면 그 거래처 합계, 반품 제외', () => {
    const y = NOWD.getFullYear();
    run([row('A', 'SB004', 30, new Date(y, 0, 5)), row('B', 'SB004', 20, new Date(y, 0, 9)), row('A', 'SB004', -7, new Date(y, 0, 9)), row('A', 'SB004', 11, new Date(y - 1, 11, 20))]);
    let m = a.forecastModel(); const x = item('SB004');
    expect(m.months).toHaveLength(12); expect(m.year).toBe(y);
    expect(m.monthly(x)[0]).toBe(50); expect(m.monthly(x)[1]).toBe(0);
    a.ui.forecastCustomers = new Set(['A']); m = a.forecastModel(); expect(m.monthly(x)[0]).toBe(30);
    a.ui.forecastCustomers = new Set(); a.ui.forecastYear = y - 1; m = a.forecastModel();
    expect(m.year).toBe(y - 1); expect(m.monthly(x)[11]).toBe(11); expect(m.yearList).toContain(y - 1);
    a.ui.forecastYear = null;
  });
  it('선택은 필터를 바꿔도 유지, 발주 목록에는 중복 없이 · 기존 수량 유지', async () => {
    const ins = await I(), a = {...A, ...(await import('./actions.js'))}; a.ui.cart.clear();
    run([row('A', 'SB002', 100, inMonth(1)), row('B', 'SB005', 100, inMonth(1))]);
    a.toggleForecastSelect('SB002'); a.setForecastSelectMany(['SB005', 'SB004'], true);
    a.ui.forecastGrade = '위험'; a.ui.forecastCustomers = new Set(['A']); a.forecastModel();
    expect([...a.ui.forecastSelected].sort()).toEqual(['SB002', 'SB004', 'SB005']);
    ins.setCartQty('SB002', 7);
    const r = ins.addManyToCart([...a.ui.forecastSelected]);
    expect(r).toEqual({added: 2, existing: 1});
    expect(a.ui.cart.get('SB002')).toBe(7); // 이미 담긴 수량 유지
    expect(ins.addManyToCart(['SB002', 'SB005'])).toEqual({added: 0, existing: 2});
    a.clearForecastSelect(); expect(a.ui.forecastSelected.size).toBe(0);
    a.ui.cart.clear(); a.ui.forecastGrade = ''; a.ui.forecastCustomers = new Set();
  });
  it('최근 6개월 · 올해 열에 판매가 없어도, 작년 달이 목표면 부족이 나옴 — 목표가 된 달을 근거로 보여 줌', () => {
    const y = NOWD.getFullYear(), curM = NOWD.getMonth();
    // 12개월 창 안이지만 올해 1월~지난달 밖: 작년 같은 달 이후
    run([row('A', 'SB002', 400, new Date(y - 1, curM + 1 > 11 ? 11 : curM + 1, 12))]);
    const x = item('SB002'); const m = a.forecastModel();
    expect(x.target).toBe(400); expect(x.orderQty).toBe(380);
    expect(m.monthly(x).every(v => v === 0)).toBe(true); // 올해 열은 전부 0
    expect(x.peak.month.y).toBe(y - 1); expect(x.peak.qty).toBe(400); expect(x.peak.customers[0]).toEqual({cust: 'A', qty: 400});
  });
});

describe('선택 거래처 기준 재계산 (단일 · 다중 · 전체 · 공유 재고 · 마이너스 재고)', () => {
  const SALES = () => [row('A', 'SB005', 200, inMonth(1)), row('B', 'SB005', 200, inMonth(1)), row('C', 'SB005', 200, inMonth(1)), row('A', 'SB005', 50, inMonth(2))];
  const scope = (...c) => { a.ui.forecastCustomers = new Set(c); return a.forecastModel().list.find(x => x.품번 === 'SB005'); };
  it('전체 = 모든 거래처 합계, 단일 = 그 거래처만, 다중 = 고른 거래처 합계 (월 · 품목별로 모음)', () => {
    run(SALES());
    const all = scope(); // 가용 0, 입고예정 100
    expect([all.target, all.orderQty, all.scoped]).toEqual([600, 500, undefined]);
    const one = scope('A'); expect([one.target, one.orderQty, one.scoped]).toEqual([200, 100, true]);
    const two = scope('A', 'B'); expect([two.target, two.orderQty]).toEqual([400, 300]);
    const three = scope('A', 'B', 'C'); expect([three.target, three.orderQty]).toEqual([600, 500]); // 전부 고르면 전체와 같음
    a.ui.forecastCustomers = new Set();
  });
  it('재고 · 입고예정은 품목당 한 번: 거래처별 부족을 더한 값이 아님', () => {
    run(SALES());
    const one = ['A', 'B', 'C'].map(c => scope(c));
    one.forEach(x => { expect(x.available).toBe(0); expect(x.incoming).toBe(100); }); // 어느 범위에서든 같은 재고
    const sumSeparate = one.reduce((s, x) => s + x.orderQty, 0); // 100+100+100
    const two = scope('A', 'B');
    expect(two.orderQty).toBe(300);
    expect(two.orderQty).not.toBe(one[0].orderQty + one[1].orderQty); // 200 이 아님 (재고를 두 번 빼지 않음)
    expect(sumSeparate).toBe(300); expect(scope().orderQty).toBe(500); // 전체는 합과 다름 — 따로 구해 더하지 않는다는 뜻
    a.ui.forecastCustomers = new Set();
  });
  it('월별 열 · 합계 · 상태 · 요약 건수가 선택 범위와 일치', () => {
    run([...SALES(), row('A', 'SB002', 100, inMonth(1)), row('B', 'SB002', 5, inMonth(1))]); // SB002 가용 20
    a.ui.forecastGrade = ''; a.ui.forecastShowNoSales = true;
    const y = NOWD.getFullYear();
    let m = a.forecastModel(); const x0 = m.list.find(x => x.품번 === 'SB005');
    a.ui.forecastCustomers = new Set(['A']); m = a.forecastModel();
    const x1 = m.list.find(x => x.품번 === 'SB005');
    expect(m.scopeLabel).toBe('선택 거래처 기준'); expect(m.scopeCount).toBe(1);
    expect(x1.monthTotals.reduce((s, v) => s + v, 0)).toBe(250); // A 의 12개월 합계
    expect(m.list.some(x => x.품번 === 'SB001' && !(a.state.salesRowsByProduct.get('SB001') || []).some(r => r.거래처 === 'A'))).toBe(false); // A 가 안 산 품목은 빠짐
    // 상태: SB002 는 A 기준 목표 100 (가용 20 → 위험), B 기준 목표 5 (여유)
    expect(a.forecastModel().list.find(x => x.품번 === 'SB002').grade).toBe('위험');
    a.ui.forecastCustomers = new Set(['B']); const b = a.forecastModel();
    expect(b.list.find(x => x.품번 === 'SB002')).toMatchObject({grade: '안전', orderQty: 0});
    // 요약 건수 = 표에 보이는 범위의 합
    a.ui.forecastCustomers = new Set(['A']); const sa = a.forecastModel();
    const need = sa.list.filter(x => x.orderQty > 0);
    expect([sa.needItems, sa.needQty]).toEqual([need.length, need.reduce((s, x) => s + x.orderQty, 0)]);
    a.ui.forecastCustomers = new Set(); a.ui.forecastShowNoSales = false;
    expect(a.forecastModel().scopeLabel).toBe('전체 거래처 기준');
    expect(m.monthly(x0).length).toBe(12); expect(y).toBeGreaterThan(2000);
  });
  it('마이너스 재고: 목표 − (마이너스 재고) − 입고예정, 예외 없음, 선택 범위에서도 일관', () => {
    run(SALES());
    a.state.inventory.push({품번: 'SB005', 품명: 'x', 바코드: '', 창고: 'EMP 물류', LOT: '', 가용재고: -30, 재고수량: -30});
    a.computeDerived();
    const all = scope(); expect(all.available).toBe(-30); expect(all.orderQty).toBe(600 + 30 - 100);
    const one = scope('A'); expect(one.orderQty).toBe(200 + 30 - 100); expect(one.grade).toBe('위험'); // (−30+100)/200 = 35% < 50%
    expect(() => { a.coverageBands(); a.customerShortRows(); }).not.toThrow();
    a.ui.forecastCustomers = new Set(); a.state.inventory.pop(); a.computeDerived(); // 추가한 마이너스 재고 줄 제거
  });
  it('거래처를 바꿔도 발주 목록의 기존 수량은 그대로, 새로 담을 때는 화면의 부족 수량이 기본값', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear();
    run(SALES());
    ins.setCartQty('SB005', 77);
    scope('A'); scope(); scope('B', 'C');
    expect(a.ui.cart.get('SB005')).toBe(77); // 필터 전환만으로 변하지 않음
    ins.removeFromCart('SB005');
    a.ui.forecastCustomers = new Set(['A', 'B']);
    ins.addManyToCart(['SB005']); expect(a.ui.cart.get('SB005')).toBe(300); // 선택 거래처 기준 부족
    a.ui.forecastCustomers = new Set(); a.ui.cart.clear();
  });
  it('선택 거래처가 최근 12개월 완료 월에 판매 없이 이번 달에만 샀다면 목표 0 → 참고', () => {
    run([row('A', 'SB005', 100, inMonth(1)), row('Z', 'SB005', 50, inMonth(0, 1))]);
    const z = scope('Z'); expect([z.target, z.orderQty, z.grade]).toEqual([0, 0, '데이터부족']);
    a.ui.forecastCustomers = new Set();
  });
  it('CSV 에 기준 표시', () => {
    run(SALES()); a.ui.forecastGrade = ''; scope('A'); a.ui._forecastCsvRows = a.forecastModel().list;
    expect(a.forecastListCsv().csv).toContain(',선택 거래처 기준');
    a.ui.forecastCustomers = new Set(); a.ui._forecastCsvRows = a.forecastModel().list;
    expect(a.forecastListCsv().csv).toContain(',전체 거래처 기준');
  });
});

describe('발주 목록에 담을 때 부족 수량 · 계산 기준 저장', () => {
  const SALES = () => [row('A', 'SB005', 200, inMonth(1)), row('B', 'SB005', 200, inMonth(1)), row('C', 'SB005', 200, inMonth(1))];
  const meta = pn => a.ui.cartMeta.get(pn);
  it('전체 기준으로 담으면 전체 부족 수량 + 전체 거래처 기준, 선택 기준으로 담으면 그 부족 수량 + 거래처 이름', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    run(SALES());
    a.ui.forecastCustomers = new Set();
    ins.addManyToCart(['SB005']);
    expect(a.ui.cart.get('SB005')).toBe(500); expect(meta('SB005')).toEqual({scope: '전체 거래처 기준', calc: 500});
    ins.removeFromCart('SB005'); expect(a.ui.cartMeta.has('SB005')).toBe(false);
    a.ui.forecastCustomers = new Set(['A', 'B']);
    ins.addToCart('SB005');
    expect(a.ui.cart.get('SB005')).toBe(300); expect(meta('SB005')).toEqual({scope: '선택 거래처 기준: A, B', calc: 300});
    a.ui.forecastCustomers = new Set();
  });
  it('필터를 바꾸거나 다시 담아도 기존 수량 · 기준을 덮어쓰지 않고, 수동 수정은 유지(수정됨 표시)', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    run(SALES());
    a.ui.forecastCustomers = new Set(['A']); ins.addToCart('SB005'); // 부족 100, 선택 거래처 기준: A
    ins.setCartQty('SB005', 150); // 수동 수정
    a.ui.forecastCustomers = new Set(); a.forecastModel(); // 필터 전환
    expect(ins.addToCart('SB005')).toEqual({added: false}); // 다시 담기 = 무시
    expect(ins.addManyToCart(['SB005'])).toEqual({added: 0, existing: 1});
    expect(a.ui.cart.get('SB005')).toBe(150); expect(meta('SB005')).toEqual({scope: '선택 거래처 기준: A', calc: 100});
    const r = ins.cartRows().find(x => x.pn === 'SB005');
    expect(r).toMatchObject({qty: 150, calc: 100, scope: '선택 거래처 기준: A', edited: true});
    ins.setCartQty('SB005', 100); expect(ins.cartRows()[0].edited).toBe(false);
    // 다른 품목을 다른 범위로 담아도 기존 항목은 그대로
    run([...SALES(), row('A', 'SB002', 100, inMonth(1))]);
    ins.addToCart('SB002'); expect(meta('SB002').scope).toBe('전체 거래처 기준'); expect(meta('SB005').scope).toBe('선택 거래처 기준: A');
  });
  it('품목 상세에서 담으면 전체 기준 수량을 명시해서 저장(현재 거래처 필터와 무관)', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    run(SALES()); a.ui.forecastCustomers = new Set(['A']);
    ins.addToCart('SB005', 500, ins.SCOPE_ALL);
    expect(a.ui.cart.get('SB005')).toBe(500); expect(meta('SB005').scope).toBe('전체 거래처 기준');
    a.ui.forecastCustomers = new Set();
  });
  it('저장 · 불러오기(예전 형식 포함)와 CSV 에 기준 포함', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    run(SALES()); a.ui.forecastCustomers = new Set(['A', 'B']); ins.addToCart('SB005'); a.ui.forecastCustomers = new Set();
    const saved = JSON.parse(localStorage.getItem('inv_order_list'));
    expect(saved).toEqual([['SB005', 300, {scope: '선택 거래처 기준: A, B', calc: 300}]]);
    const csv = ins.cartCsv().csv;
    expect(csv.split('\r\n')[0]).toBe('\uFEFF품번,품명,바코드,구분,가용재고,입고예정,담을 때 부족 수량,계산 기준,발주수량');
    expect(csv).toContain(',300,"선택 거래처 기준: A, B",300');
    localStorage.setItem('inv_order_list', JSON.stringify([['SB001', 40]])); // 예전에 저장된 형식
    const again = await import('./insights.js?legacy'); const st = await import('./store.js'); // 새로 불러와서 저장소에서 다시 읽음
    expect(st.ui.cart.get('SB001')).toBe(40);
    expect(again.cartRows()[0]).toMatchObject({qty: 40, scope: '', calc: null, edited: false}); // 기준 정보 없음으로 표시
    localStorage.removeItem('inv_order_list');
  });
});

describe('미판매(6개월 이상) 품목은 생산 필요 · 추천에서 제외', () => {
  const y = NOWD.getFullYear(), mo = NOWD.getMonth();
  const d = (back, day) => new Date(y, mo - back, day);
  const big = (cust, pn, when) => row(cust, pn, 500, when);
  const find = pn => a.forecastModel().list.find(x => x.품번 === pn);
  const all = () => { a.ui.forecastGrade = ''; a.ui.forecastShowNoSales = true; a.ui.forecastCustomers = new Set(); };
  it('마지막 판매가 6개월 창(이번 달 + 앞 5개월) 밖이면 참고 + 사유, 부족 수량 계산은 그대로', () => {
    all(); run([big('A', 'SB002', d(7, 10))]); // 가용 20, 목표 500
    const x = item('SB002');
    expect(x.grade).toBe('데이터부족'); expect(a.statusLabel(x.grade)).toBe('참고');
    expect(x.inactiveReason).toBe('6개월 이상 미판매'); expect(x.orderQty).toBe(480); // 참고용으로 보존
    expect(x.lastSale.getTime()).toBe(d(7, 10).getTime());
  });
  it('12개월 이상 / 판매 이력 없음 사유, 반품 · 잘못된 날짜 · 숫자 아닌 수량은 판매로 안 침', () => {
    all(); run([big('A', 'SB002', d(14, 3))]);
    expect(item('SB002').inactiveReason).toBe('12개월 이상 미판매');
    run([]); expect(item('SB002').inactiveReason).toBe('판매 이력 없음');
    run([big('A', 'SB002', d(8, 5)), row('A', 'SB002', -50, d(0, 1)), {...big('A', 'SB002', d(0, 1)), 실적일자: new Date(NaN)}, {...big('A', 'SB002', d(0, 1)), 수량: NaN}]);
    expect(item('SB002').inactiveReason).toBe('6개월 이상 미판매'); // 이번 달 반품 · 잘못된 줄은 최근 판매가 아님
  });
  it('경계: 6개월 창 첫날은 판매로 침, 그 전날은 미판매. 이번 달 판매는 완료된 달이 없어도 실제 날짜로 인정', () => {
    all(); run([big('A', 'SB002', d(5, 1))]); expect(item('SB002').inactiveReason).toBeNull();
    run([big('A', 'SB002', new Date(y, mo - 5, 0))]); expect(item('SB002').inactiveReason).toBe('6개월 이상 미판매'); // 앞달 말일
    run([big('A', 'SB002', d(0, 1))]); const x = item('SB002');
    expect(x.inactiveReason).toBeNull(); expect(x.target).toBe(0); // 이번 달만 판매: 미판매 아님, 목표는 완료된 달만이라 0 → 참고(사유 없음)
  });
  it('위험 · 주의 건수와 생산 필요 요약에서 제외되고, 판매가 다시 생기면 자동으로 정상 판정', () => {
    all(); run([big('A', 'SB002', d(8, 10)), big('B', 'SB004', d(1, 10))]); // SB002 미판매(가용 20), SB004 정상 판매(가용 60 → 주의)
    let m = a.forecastModel();
    expect(m.list.find(x => x.품번 === 'SB002').grade).toBe('데이터부족');
    expect(m.gradeChips.find(c => c[0] === '위험')[2] + m.gradeChips.find(c => c[0] === '주의')[2]).toBe(m.list.filter(x => ['위험', '주의'].includes(x.grade)).length);
    expect(m.list.some(x => x.품번 === 'SB002' && ['위험', '주의'].includes(x.grade))).toBe(false);
    const need = m.list.filter(x => x.orderQty > 0 && !['데이터부족'].includes(x.grade));
    expect([m.needItems, m.needQty]).toEqual([need.length, need.reduce((s, x) => s + x.orderQty, 0)]);
    expect(need.some(x => x.품번 === 'SB002')).toBe(false);
    expect(a.overviewModel().counts.위험 + a.overviewModel().counts.주의).toBe(a.state.forecast.filter(x => ['위험', '주의'].includes(x.grade)).length);
    expect(a.urgentItems().some(x => x.품번 === 'SB002')).toBe(false);
    // 판매 재개 → 정상 계산(생산 필요)
    run([big('A', 'SB002', d(8, 10)), big('A', 'SB002', d(0, 5))]); // 이번 달에 다시 판매, 목표는 완료된 달(8달 전) 500
    const back = item('SB002'); expect(back.inactiveReason).toBeNull(); expect(back.grade).toBe('위험'); expect(back.orderQty).toBe(480);
  });
  it('거래처 범위별로 같은 규칙: 전체 · 단일 · 다중', () => {
    all(); run([big('A', 'SB002', d(9, 10)), big('B', 'SB002', d(1, 10))]); // A 는 오래전, B 는 최근
    const pick = (...c) => { a.ui.forecastCustomers = new Set(c); return find('SB002'); };
    expect(pick().inactiveReason).toBeNull();                       // 전체: B 가 최근 판매
    expect(pick('A')).toMatchObject({inactiveReason: '6개월 이상 미판매', grade: '데이터부족', scoped: true});
    expect(pick('B').inactiveReason).toBeNull();
    expect(pick('A', 'B').inactiveReason).toBeNull();              // 다중: 하나라도 최근이면 활성
    expect(pick('A').orderQty).toBeGreaterThan(0);                  // 계산은 그대로(참고용)
    a.ui.forecastCustomers = new Set();
  });
  it('미판매 필터: 미판매 품목만, 참고 칩에도 포함, 위험 · 주의 · 여유에는 없음', () => {
    all(); run([big('A', 'SB002', d(8, 10)), big('B', 'SB004', d(1, 10)), big('A', 'MC001', d(2, 10))]);
    a.ui.forecastShowNoSales = false; a.ui.forecastGrade = '미판매';
    const m = a.forecastModel();
    expect(m.list.length).toBeGreaterThan(0); m.list.forEach(x => expect(x.inactiveReason).toBeTruthy());
    expect(m.gradeChips.find(c => c[0] === '미판매')[2]).toBe(m.list.length);
    a.ui.forecastGrade = '참고'; expect(a.forecastModel().list.some(x => x.품번 === 'SB002')).toBe(true);
    for (const g of ['위험', '주의', '여유', '조치필요']) { a.ui.forecastGrade = g; expect(a.forecastModel().list.some(x => x.inactiveReason)).toBe(false); }
    a.ui.forecastGrade = '';
  });
  it('어디에서도 미판매 품목이 생산 필요 · 추천으로 나오지 않음 (히어로 포함 · 알람 · 개요 · 요약 · 고객별 보기 · CSV)', () => {
    all(); run([big('A', 'SB002', d(8, 10)), big('B', 'SB004', d(1, 10))]);
    a.settings.hero = {SB002: {minQty: 1e9}}; a.computeDerived();
    const x = item('SB002'); expect(x.hero).toBe(true); expect(x.grade).toBe('데이터부족');
    expect(a.state.heroAlerts.some(h => h.품번 === 'SB002')).toBe(false);
    a.state.forecast.forEach(f => { if (f.inactiveReason) expect(['위험', '주의']).not.toContain(f.grade); });
    expect(a.customerShortRows().find(r => r.cust === 'A').short).toBe(0); // A 의 부족 품목에 미판매 SB002 없음
    a.ui.forecastGrade = ''; a.ui._forecastCsvRows = a.forecastModel().list;
    expect(a.forecastListCsv().csv).toMatch(/SB002,.*,참고,.*6개월 이상 미판매/);
    a.settings.hero = {};
  });
  it('발주 목록 수량 · 월별 판매는 그대로', async () => {
    const ins = await import('./insights.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    all(); run([big('A', 'SB002', d(8, 10))]);
    ins.addToCart('SB002'); expect(a.ui.cart.get('SB002')).toBe(480); // 참고용 부족 수량으로 담기는 기존 동작 유지
    const m = a.forecastModel(); expect(m.monthly(find('SB002')).length).toBe(12);
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
});
