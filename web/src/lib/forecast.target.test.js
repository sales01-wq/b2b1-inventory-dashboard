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
  it('재고는 품목당 한 번: 거래처가 여럿이어도 부족 수량이 늘지 않음', () => {
    run([row('A', 'SB005', 200, inMonth(1)), row('B', 'SB005', 200, inMonth(1)), row('C', 'SB005', 200, inMonth(1))]);
    expect(item('SB005').orderQty).toBe(500); // 600 − 0 − 100
    a.ui.forecastCustomers = new Set(['A']);
    expect(a.forecastModel().list.find(x => x.품번 === 'SB005').orderQty).toBe(500); // 거래처 필터로 나눠지지 않음
    a.ui.forecastCustomers = new Set();
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
    expect(a.gradeChips === undefined && a.forecastModel().gradeChips.map(c => c[1])).toEqual(['생산 필요 + 추천', '생산 필요', '생산 추천', '여유', '참고', '전체']);
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
  it('여러 거래처는 OR: 하나라도 산 품목, 품목은 한 번씩만, 부족 수량은 그대로', () => {
    run([row('A', 'SB002', 100, inMonth(1)), row('B', 'SB004', 100, inMonth(1)), row('C', 'SB005', 100, inMonth(1)), row('B', 'SB002', 50, inMonth(2))]);
    const all = a.forecastModel().list.map(x => [x.품번, x.orderQty]);
    a.ui.forecastCustomers = new Set(['A', 'B']);
    const list = a.forecastModel().list;
    expect(list.map(x => x.품번).sort()).toEqual(['SB002', 'SB004']); // SB002 는 A·B 둘 다 샀어도 한 줄
    list.forEach(x => expect(x.orderQty).toBe(all.find(r => r[0] === x.품번)[1]));
    a.ui.forecastCustomers = new Set();
  });
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
