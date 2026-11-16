// 상품 그룹 2단계: 확정된 그룹만 계산에 반영 — 판매 합산 · 대표 SKU 고정 · 재고(대표 + 호환만, 한 번씩) · 미판매 · 히어로/마스크 · 발주 목록 · 이상값
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, I, SG;
const N = new Date(NOW), y = N.getFullYear(), mo = N.getMonth();
const d = (back, day = 10) => new Date(y, mo - back, day);
const sale = (cust, pn, qty, when) => ({거래처: cust, 품번: pn, 품명: pn, 수량: qty, 실적일자: when, 금액: 0});
const sku = (pn, name, avail, extra = {}) => ({pn, name, avail, incoming: 0, incDate: '', barcode: '', status: '정상', ...extra});
function build(skus, sales, groups = {}, opts = {}) {
  a.state.inventory = skus.map(s => ({창고: 'EMP 물류', 가용재고: s.avail, 품번: s.pn, 품명: s.name, 바코드: s.barcode, 규격: '', 현재고: s.avail, 입고예정: 0, 출고예정: 0, 안전재고: 0}));
  a.state.schedule = skus.map(s => ({품번: s.pn, 품명: s.name, 거래처: 'A', 바코드: s.barcode, 품목상태: s.status, 가용재고: s.avail, 재고합계: s.avail, aug_d: s.incDate, aug_q: s.incoming, sep_d: '', sep_q: 0, oct_d: '', oct_q: 0}));
  a.state.scheduleMonthLabels = ['1월', '2월', '3월'];
  a.state.sales = sales; a.state.salesByTeam = {B2B1팀: sales}; a.state.expiry = []; a.state.productMaster = [];
  a.settings.hero = opts.hero || {}; a.settings.mask = opts.mask || {}; a.settings.rules = {}; a.settings.skuGroups = groups;
  Object.assign(a.ui, {forecastGrade: '', forecastShowNoSales: true, forecastCategory: 'all', forecastBrand: ''}); a.ui.forecastCustomers = new Set();
  a.state.loaded = true; a.computeDerived();
}
const row = pn => a.state.forecast.find(x => x.품번 === pn);
const G = (members, extra = {}) => ({name: '세럼', members, rep: null, compat: [], ...extra});
const NA = '세럼 (북미)', GL = '세럼 (글로벌)';

beforeAll(async () => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  const mem = new Map(); globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  a = (await loadPort()).api; I = await import('./insights.js'); SG = await import('./skugroups.js');
});
afterAll(() => vi.useRealTimers());

describe('확정 그룹만 반영, 그 밖은 개별 계산 그대로', () => {
  it('그룹 없음 · 후보 · 거절 · 알 수 없는 그룹은 결과가 같음, 확정하면 한 줄로 합쳐짐', () => {
    const S = [sku('SB101', NA, 30), sku('SB102', GL, 20), sku('SB900', '토너', 5)];
    const SALES = [sale('A', 'SB101', 100, d(2)), sale('A', 'SB102', 150, d(2, 20)), sale('A', 'SB900', 40, d(1))];
    build(S, SALES, {}); const plain = JSON.stringify(a.state.forecast.map(x => [x.품번, x.target, x.orderQty, x.grade, x.available]));
    expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB101', 'SB102', 'SB900']);
    a.settings.skuRejected = ['SB101+SB102'];
    build(S, SALES, {gx: G(['NOPE1', 'NOPE2'])}); expect(JSON.stringify(a.state.forecast.map(x => [x.품번, x.target, x.orderQty, x.grade, x.available]))).toBe(plain);
    build(S, SALES, {g1: G(['SB101', 'SB102'])});
    expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB102', 'SB900']); // 그룹은 대표(최근 판매) 한 줄, 그룹 없는 SB900 은 그대로
    expect(a.state.forecastSku.map(x => x.품번).sort()).toEqual(['SB101', 'SB102', 'SB900']); // 개별 SKU 항목도 보존
    const u = a.state.forecast.find(x => x.품번 === 'SB900'); expect([u.target, u.orderQty, u.grade]).toEqual([40, 35, '위험']); expect(u.group).toBeUndefined();
    a.settings.skuRejected = [];
  });
});

describe('판매 합산 · 12개월 월 최대', () => {
  it('월별로 모든 멤버 판매를 합친 뒤 최대를 목표로 (멤버 개별 최대의 합이 아님)', () => {
    // 2달 전: A 100 + B 150 = 250, 5달 전: A 120 → 그룹 월 최대 250
    build([sku('SB101', NA, 30), sku('SB102', GL, 20)], [sale('A', 'SB101', 100, d(2)), sale('A', 'SB102', 150, d(2, 20)), sale('A', 'SB101', 120, d(5))], {g1: G(['SB101', 'SB102'])});
    const x = row('SB102'); // 대표 = 최근 판매 SB102
    expect(x.group.rep).toBe('SB102'); expect(x.target).toBe(250);
    expect(x.monthTotals.reduce((s, v) => s + v, 0)).toBe(370); // 판매는 한 번씩만 (중복 없음)
    expect(x.available).toBe(20); expect(x.orderQty).toBe(230); // 재고는 대표 SKU 것만
  });
  it('반품은 따로, 이번 달과 12개월 밖은 제외 (기존 규칙 그대로)', () => {
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [sale('A', 'SB101', 100, d(3)), sale('A', 'SB102', -40, d(3, 15)), sale('A', 'SB102', 999, d(0, 1)), sale('A', 'SB101', 999, d(14)), sale('A', 'SB102', 30, d(1))], {g1: G(['SB101', 'SB102'])});
    const x = row('SB102'); expect([x.target, x.returns]).toEqual([100, 40]);
  });
});

describe('거래처 필터: 선택 거래처의 판매만 합산', () => {
  it('선택 거래처의 멤버 합산 판매로 목표 계산 (대표 SKU 는 고객별로 따로 판정 — 아래 describe)', () => {
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [sale('C', 'SB101', 80, d(2)), sale('C', 'SB101', 60, d(2, 20)), sale('A', 'SB102', 300, d(1))], {g1: G(['SB101', 'SB102'], {rep: 'SB102'})}); // 수동 대표 SB102 로 고정해 합산만 확인
    a.ui.forecastCustomers = new Set(['C']); let m = a.forecastModel(); let x = m.list.find(r => r.품번 === 'SB102');
    expect([x.target, x.scoped, x.group.rep]).toEqual([140, true, 'SB102']); // C 의 SB101 판매 합계
    a.ui.forecastCustomers = new Set(['A']); x = a.forecastModel().list.find(r => r.품번 === 'SB102'); expect(x.target).toBe(300);
    a.ui.forecastCustomers = new Set(['A', 'C']); x = a.forecastModel().list.find(r => r.품번 === 'SB102'); expect(x.target).toBe(300); // 월 최대: 2달 전 C 140, 1달 전 A 300
    a.ui.forecastCustomers = new Set(['Z']); expect(a.forecastModel().list.some(r => r.품번 === 'SB102')).toBe(false); // 그 거래처가 안 산 그룹은 안 보임
    a.ui.forecastCustomers = new Set(['C']); m = a.forecastModel(); const idx = d(2).getFullYear() === m.year ? d(2).getMonth() : -1;
    if (idx >= 0) expect(m.monthly(m.list.find(r => r.품번 === 'SB102'))[idx]).toBe(140); // 월별 열도 선택 거래처의 멤버 합산
    a.ui.forecastCustomers = new Set();
  });
});

describe('대표 SKU 는 고객별 최근 판매실적일 기준 (자동 판정)', () => {
  // A: SB101 이 최근, B: SB102 가 최근, C: SB101 이 최근(오래전), D: 판매 이력 없음
  const S = () => [sku('SB101', NA, 40), sku('SB102', GL, 25)];
  const SALES = () => [sale('A', 'SB101', 100, d(1, 20)), sale('A', 'SB102', 50, d(3)), sale('B', 'SB102', 70, d(1, 10)), sale('B', 'SB101', 30, d(4)), sale('C', 'SB101', 20, d(5))];
  const pick = (...c) => { a.ui.forecastCustomers = new Set(c); const x = a.forecastModel().list.find(r => r.key === 'group:g1'); a.ui.forecastCustomers = new Set(); return x; };
  it('고객 1곳 선택: 그 고객의 가장 최근 판매 SKU 가 대표 (표시 · 재고 · 발주 대상)', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    expect(pick('A')).toMatchObject({품번: 'SB101', available: 40}); expect(pick('A').group.pending).toBeNull();
    expect(pick('B')).toMatchObject({품번: 'SB102', available: 25}); // 같은 그룹 · 같은 행(key)이지만 고객이 바뀌면 대표 SKU 와 재고가 바뀜
    expect(pick('A').group.repBasis).toMatch(/A 의 최근 판매실적일 기준/);
    expect(pick('C')).toMatchObject({품번: 'SB101'}); // 오래전이어도 그 고객 기준
  });
  it('여러 고객 · 전체: 고객들의 SKU 가 모두 같을 때만 대표, 다르면 선택 필요(임시 표시, 담기 차단)', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    expect(pick('A', 'C')).toMatchObject({품번: 'SB101'}); expect(pick('A', 'C').group.pending).toBeNull(); // 둘 다 SB101
    const amb = pick('A', 'B'); expect(amb.group.pending.reason).toMatch(/고객마다 최근에 판 SKU 가 달라/); expect(amb.group.pending.perCustomer.map(p => [p.cust, p.pn]).sort()).toEqual([['A', 'SB101'], ['B', 'SB102']]);
    const all = a.state.forecast.find(x => x.key === 'group:g1'); expect(all.group.pending).not.toBeNull(); // 전체 고객: A · B · C 중 서로 다름
    expect(all.품번).toBe('SB101'); // 임시 표시(전체 기준 최근 판매 SKU)일 뿐, 대표로 확정되지 않음
  });
  it('판매 이력이 없는 고객: 다른 고객의 SKU 를 대신 쓰지 않고 선택 필요, 여러 고객 선택 시에는 이력 없는 고객은 무시', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    const base = a.state.forecast.find(x => x.key === 'group:g1');
    const z = a.scopeForecastItem(base, new Set(['D'])); expect(z.group.pending.reason).toMatch(/D 의 이 그룹 판매 이력이 없어/); expect(z.group.rep).toBeTruthy();
    expect(pick('A', 'D')).toMatchObject({품번: 'SB101'}); // D 는 이력이 없어 판정에서 빠지고 A 의 SKU 로 확정되지 않음? → A 만 남아 SB101
    expect(a.forecastModel().list.length).toBeGreaterThan(0);
  });
  it('최근 12개월에 사지 않은 옛 고객은 전체 판정을 모호하게 만들지 않음', () => {
    build(S(), [sale('A', 'SB101', 100, d(1)), sale('OLD', 'SB102', 40, d(20))], {g1: G(['SB101', 'SB102'])});
    expect(a.state.forecast.find(x => x.key === 'group:g1')).toMatchObject({품번: 'SB101'}); expect(a.state.forecast.find(x => x.key === 'group:g1').group.pending).toBeNull();
  });
  it('같은 날짜면 그 고객의 직전 3개월 판매량, 그래도 같으면 선택 필요', () => {
    build(S(), [sale('A', 'SB101', 10, d(1, 15)), sale('A', 'SB102', 90, d(1, 15))], {g1: G(['SB101', 'SB102'])}); expect(pick('A')).toMatchObject({품번: 'SB102'});
    build(S(), [sale('A', 'SB101', 50, d(1, 15)), sale('A', 'SB102', 50, d(1, 15))], {g1: G(['SB101', 'SB102'])}); expect(pick('A').group.pending.reason).toMatch(/동률|같고 직전 3개월/);
  });
  it('수동 대표 지정은 고객과 무관하게 우선 (기존 수동 설정 보존)', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102'], {rep: 'SB102'})});
    expect(pick('A')).toMatchObject({품번: 'SB102'}); expect(pick('A').group.repManual).toBe(true); expect(pick('A', 'B').group.pending).toBeNull();
  });
  it('재고 · 입고예정은 대표 SKU 만 (호환 확인한 SKU 는 더함), 고객별 대표에 따라 달라지지만 같은 SKU 를 두 번 세지 않음', () => {
    build([sku('SB101', NA, 40, {incoming: 10, incDate: '2999-01-01'}), sku('SB102', GL, 25, {incoming: 5, incDate: '2999-01-01'})], SALES(), {g1: G(['SB101', 'SB102'], {compat: ['SB101', 'SB102']})});
    const a1 = pick('A'); expect([a1.available, a1.incoming]).toEqual([65, 15]); // 대표 SB101 + 호환 SB102 (한 번씩)
    build([sku('SB101', NA, 40, {incoming: 10, incDate: '2999-01-01'}), sku('SB102', GL, 25, {incoming: 5, incDate: '2999-01-01'})], SALES(), {g1: G(['SB101', 'SB102'])});
    expect([pick('A').available, pick('B').available]).toEqual([40, 25]);
  });
});

describe('발주 목록: 고객별 대표 SKU 로 담기 · 선택 필요 · 기존 항목 보존', () => {
  const S = () => [sku('SB101', NA, 40), sku('SB102', GL, 25)];
  const SALES = () => [sale('A', 'SB101', 100, d(1, 20)), sale('B', 'SB102', 70, d(1, 10))];
  it('고객 1곳 선택하면 그 고객의 SKU 로 담김, 선택 필요 그룹은 담기 차단 · 직접 선택하면 담김', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    a.ui.forecastCustomers = new Set(['B']); let r = I.addManyToCart(['group:g1']); a.ui.forecastCustomers = new Set();
    expect(r).toMatchObject({added: 1, pending: []}); expect(a.ui.cart.has('SB102')).toBe(true); expect(a.ui.cartMeta.get('SB102').group).toMatchObject({id: 'g1', rep: 'SB102', auto: false}); expect(a.ui.cartMeta.get('SB102').group.basis).toMatch(/B 의 최근 판매실적일/);
    a.ui.cart.clear(); a.ui.cartMeta.clear();
    r = I.addManyToCart(['group:g1']); // 전체 고객: A=SB101, B=SB102 → 선택 필요
    expect(r).toMatchObject({added: 0, pending: ['세럼']}); expect(a.ui.cart.size).toBe(0);
    const x = a.state.forecast.find(v => v.key === 'group:g1');
    expect(I.addItemToCart(x)).toMatchObject({added: false, pending: true}); expect(a.ui.cart.size).toBe(0);
    expect(I.addItemToCart(x, 'SB101')).toMatchObject({added: true}); expect(a.ui.cart.get('SB101')).toBeGreaterThan(0); expect(a.ui.cartMeta.get('SB101').group.basis).toMatch(/직접 선택/);
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
  it('고객을 바꾸거나 대표가 달라져도 기존 항목 · 수량 · 수동 수정은 그대로, 같은 그룹 중복은 경고만', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    a.ui.forecastCustomers = new Set(['A']); I.addManyToCart(['group:g1']); I.setCartQty('SB101', 77);
    a.ui.forecastCustomers = new Set(['B']); const r = I.addManyToCart(['group:g1']); a.ui.forecastCustomers = new Set(); // B 의 SKU = SB102 → 같은 그룹의 SB101 이 이미 있음
    expect(r.added).toBe(1); expect(r.warnings.join()).toMatch(/같은 그룹\(세럼\)의 다른 SKU 가 이미 발주 목록에 있습니다 — SB101/);
    expect(a.ui.cart.get('SB101')).toBe(77); expect(a.ui.cart.size).toBe(2); expect(a.ui.cartMeta.get('SB101').group.rep).toBe('SB101');
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
});
describe('대표 SKU: 자동(최근 판매실적일) · 수동 · 정할 수 없으면 개별 계산', () => {
  it('판매 이력 없는 새 버전을 수동 대표로: 표시 품번 · 재고는 그 SKU, 판매는 멤버 합산', () => {
    build([sku('SB101', NA, 40), sku('SB102', GL, 25), sku('SB103', '세럼 (신규 글로벌)', 7, {incoming: 50, incDate: '2999-01-01'})], [sale('A', 'SB101', 100, d(2)), sale('A', 'SB102', 60, d(2, 20))], {g1: G(['SB101', 'SB102', 'SB103'], {rep: 'SB103'})});
    const x = row('SB103'); expect(x.group.repManual).toBe(true);
    expect([x.target, x.available, x.incoming, x.orderQty]).toEqual([160, 7, 50, 103]);
    expect(a.state.forecast.some(r => ['SB101', 'SB102'].includes(r.품번))).toBe(false);
    expect(x.inactiveReason).toBeNull(); // 합친 판매 이력으로 판정 (대표 SKU 자체는 판매 없음)
  });
  it('대표를 정할 수 없으면(동률 · 판매 전무) 그룹은 적용하되 SKU 선택 필요로 표시 (임시로 전체 기준 최근 판매 SKU 를 보여 줌)', () => {
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [sale('A', 'SB101', 10, d(2)), sale('A', 'SB102', 10, d(2))], {g1: G(['SB101', 'SB102'])});
    expect(a.state.groupStatus.g1).toMatchObject({applied: true, pending: true}); expect(a.state.forecast.find(x => x.key === 'group:g1').group.pending).not.toBeNull();
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [], {g1: G(['SB101', 'SB102'])}); expect(a.state.groupStatus.g1).toMatchObject({applied: true, pending: true});
  });
  it('대표가 바뀌어도(새 판매) 재계산되고 개별 항목은 그대로', () => {
    const S = [sku('SB101', NA, 40), sku('SB102', GL, 25)];
    build(S, [sale('A', 'SB101', 100, d(1)), sale('A', 'SB102', 60, d(3))], {g1: G(['SB101', 'SB102'])}); expect(row('SB101').group.rep).toBe('SB101');
    build(S, [sale('A', 'SB101', 100, d(1)), sale('A', 'SB102', 60, d(0, 1))], {g1: G(['SB101', 'SB102'])}); expect(row('SB102').group.rep).toBe('SB102');
  });
});

describe('재고 · 입고예정: 대표 + 호환 확인한 SKU 만, 한 번씩', () => {
  const S = () => [sku('SB101', NA, 40, {incoming: 10, incDate: '2999-01-01'}), sku('SB102', GL, 25, {incoming: 5, incDate: '2999-01-01'}), sku('SB103', '세럼 (유럽)', -30)];
  const SALES = () => [sale('A', 'SB101', 100, d(5)), sale('A', 'SB102', 200, d(1)), sale('A', 'SB103', 50, d(6))];
  it('기본은 대표만, 호환 체크한 멤버를 더함 (마이너스 재고 포함), 같은 SKU 를 두 번 세지 않음', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102', 'SB103'])});
    let x = row('SB102'); expect([x.available, x.incoming, x.orderQty]).toEqual([25, 5, 170]); // 대표 SB102 만
    build(S(), SALES(), {g1: G(['SB101', 'SB102', 'SB103'], {compat: ['SB101']})});
    x = row('SB102'); expect([x.available, x.incoming, x.orderQty]).toEqual([65, 15, 120]);
    build(S(), SALES(), {g1: G(['SB101', 'SB102', 'SB103'], {compat: ['SB101', 'SB103', 'SB102']})}); // 대표를 호환 목록에 또 넣어도 한 번
    x = row('SB102'); expect([x.available, x.incoming]).toEqual([35, 15]); // 25 + 40 + (−30)
    expect(x.group.members.map(m => [m.pn, m.compat, m.isRep])).toEqual([['SB101', true, false], ['SB102', false, true], ['SB103', true, false]]);
  });
  it('고객 전용 섞인 그룹 · 일부 멤버가 데이터에 없음', () => {
    build([sku('SB101', NA, 1), sku('SB102', '세럼 (TARGET)', 1), sku('SB103', GL, 1)], [sale('A', 'SB101', 10, d(1))], {g1: G(['SB101', 'SB102'])});
    expect(a.state.groupStatus.g1.applied).toBe(false); expect(a.state.groupStatus.g1.reason).toMatch(/묶을 수 없는 구성/); expect(a.state.forecast.length).toBe(3);
    build([sku('SB101', NA, 5), sku('SB103', GL, 5)], [sale('A', 'SB101', 10, d(2)), sale('A', 'SB103', 20, d(1))], {g1: G(['SB101', 'SB103', 'GONE'])}); // 없는 멤버는 건너뛰고 적용
    expect(a.state.groupStatus.g1.applied).toBe(true); expect(row('SB103').group.missing).toEqual(['GONE']);
  });
});

describe('미판매 규칙: 합친 판매 이력 · 선택 거래처 범위', () => {
  const S = () => [sku('SB101', NA, 0), sku('SB102', GL, 0)];
  it('멤버 하나만 오래돼도 그룹은 활성, 모두 오래되면 참고 + 사유 (부족 수량은 보존)', () => {
    build(S(), [sale('A', 'SB101', 300, d(9)), sale('A', 'SB102', 100, d(2))], {g1: G(['SB101', 'SB102'])});
    expect(row('SB102')).toMatchObject({inactiveReason: null, grade: '위험'});
    build(S(), [sale('A', 'SB101', 300, d(9)), sale('A', 'SB102', 100, d(8))], {g1: G(['SB101', 'SB102'])});
    const x = row('SB102'); expect(x).toMatchObject({inactiveReason: '6개월 이상 미판매', grade: '데이터부족'}); expect(x.orderQty).toBe(300);
    expect(a.forecastModel().needItems).toBe(0); // 생산 필요 요약에서 제외
  });
  it('거래처 범위: 선택 거래처의 합친 판매 기준으로 활성/미판매 판정', () => {
    build(S(), [sale('A', 'SB101', 300, d(9)), sale('B', 'SB102', 100, d(1)), sale('A', 'SB102', 50, d(8))], {g1: G(['SB101', 'SB102'])});
    a.ui.forecastCustomers = new Set(['A']); expect(a.forecastModel().list.find(x => x.품번 === 'SB102').inactiveReason).toBe('6개월 이상 미판매'); // A 는 오래전에만
    a.ui.forecastCustomers = new Set(['B']); expect(a.forecastModel().list.find(x => x.품번 === 'SB102').inactiveReason).toBeNull();
    a.ui.forecastCustomers = new Set(['A', 'B']); expect(a.forecastModel().list.find(x => x.품번 === 'SB102').inactiveReason).toBeNull();
    a.ui.forecastCustomers = new Set();
  });
});

describe('히어로 · 마스크는 그룹 단위, 요약 · 상태 건수에 한 번만', () => {
  it('멤버 중 하나가 지정되면 그룹 전체가 해당 구분, 대표 설정이 있으면 우선', () => {
    const S = [sku('SB101', NA, 3), sku('SB102', GL, 3), sku('SB900', '토너', 3)];
    const SALES = [sale('A', 'SB101', 10, d(2)), sale('A', 'SB102', 20, d(1)), sale('A', 'SB900', 20, d(1))];
    build(S, SALES, {g1: G(['SB101', 'SB102'])}, {hero: {SB101: {minQty: 100}}, mask: {SB101: true}});
    const x = row('SB102'); expect([x.hero, x.mask, x.heroMin]).toEqual([true, true, 100]); expect(x.grade).toBe('위험'); // 수량 기준(가용 3 ≤ 100)
    expect(a.state.heroAlerts.map(h => h.품번)).toEqual(['SB102']);
    a.ui.forecastCategory = 'hero'; expect(a.forecastModel().list.map(r => r.품번)).toEqual(['SB102']);
    a.ui.forecastCategory = 'mask'; expect(a.forecastModel().list.map(r => r.품번)).toEqual(['SB102']);
    a.ui.forecastCategory = 'all';
    build(S, SALES, {g1: G(['SB101', 'SB102'])}, {hero: {SB101: {minQty: 100}, SB102: {minQty: 1}}}); expect(row('SB102').heroMin).toBe(1); // 대표 설정 우선
  });
  it('요약 · 상태 칩 · 개요 · 거래처별 보기에서 그룹은 한 번만 셈', () => {
    build([sku('SB101', NA, 0), sku('SB102', GL, 0), sku('SB900', '토너', 0)], [sale('A', 'SB101', 100, d(2)), sale('A', 'SB102', 100, d(2, 20)), sale('A', 'SB900', 50, d(1))], {g1: G(['SB101', 'SB102'])});
    const m = a.forecastModel();
    expect(m.list.length).toBe(2); expect([m.needItems, m.needQty]).toEqual([2, 200 + 50]); // 그룹 200 (월 합산 최대) + 토너 50
    expect(m.gradeChips.find(c => c[0] === '').at(2)).toBe(2);
    expect(a.ui._forecastCsvRows.length).toBe(m.list.length); expect(a.forecastListCsv().csv).toMatch(/그룹 SB101\+SB102\(대표\)/); // CSV 대상 = 화면 목록, 그룹 열
    const ov = a.overviewModel(); expect(ov.total).toBe(2);
    expect(a.customerShortRows().find(r => r.cust === 'A')).toMatchObject({items: 2, short: 2});
    expect(a.ui.forecastVisiblePns.slice().sort()).toEqual(m.list.map(x => x.key || x.품번).sort()); // 선택 식별자: 그룹은 group:id
  });
});

describe('이상값: 마이너스 · 숫자 아님 · 날짜 오류에도 예외 없음', () => {
  it('그룹 계산이 유한한 숫자만 만들고 화면 모델이 모두 동작', () => {
    build([sku('SB101', NA, -40), sku('SB102', GL, NaN, {incoming: NaN}), sku('SB103', '세럼 (유럽)', undefined)],
      [sale('A', 'SB101', NaN, d(1)), sale('', 'SB102', 30, d(1)), sale('A', 'SB103', -10, d(2)), {...sale('A', 'SB102', 5, d(1)), 실적일자: new Date(NaN)}], {g1: G(['SB101', 'SB102', 'SB103'], {compat: ['SB101', 'SB103']})});
    a.state.forecast.forEach(x => ['available', 'incoming', 'target', 'orderQty'].forEach(k => expect(Number.isFinite(x[k]), `${x.품번}.${k}`).toBe(true)));
    for (const g of ['', '조치필요', '미판매', '참고']) { a.ui.forecastGrade = g; a.ui.forecastCustomers = new Set(['A']); a.forecastModel().list.forEach(x => a.forecastDetail(x)); a.ui.forecastCustomers = new Set(); }
    expect(() => { a.coverageBands(); a.customerShortRows(); a.overviewModel(); a.urgentItems(); I.cartRows(); I.searchProducts('sb'); a.forecastListCsv(); }).not.toThrow();
    a.ui.forecastGrade = '';
  });
});

describe('발주 목록: 대표 SKU · 그룹 스냅샷 · 중복 경고 · 자동 변경 없음', () => {
  const S = () => [sku('SB101', NA, 0), sku('SB102', GL, 0)];
  const SALES = (late) => [sale('A', 'SB101', 100, d(2, late ? 10 : 20)), sale('A', 'SB102', 100, d(2, late ? 20 : 10))]; // 같은 달 → 합산 200, 날짜로 대표 결정
  it('그룹을 담으면 대표 SKU · 부족 수량 · 범위 · 그룹 구성 스냅샷 저장', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear();
    build(S(), SALES(false), {g1: G(['SB101', 'SB102'])}); // 대표 SB101
    a.ui.forecastCustomers = new Set(['A']); const r = I.addManyToCart(['SB101']); a.ui.forecastCustomers = new Set();
    expect(r).toMatchObject({added: 1, warnings: []}); expect(a.ui.cart.get('SB101')).toBe(200);
    expect(a.ui.cartMeta.get('SB101')).toMatchObject({scope: '선택 거래처 기준: A', calc: 200, inactive: null, group: {id: 'g1', name: '세럼', rep: 'SB101', members: ['SB101', 'SB102'], compat: []}});
    expect(I.cartCsv().csv).toMatch(/세럼: 대표 SB101 \/ SB101\+SB102/);
  });
  it('대표가 바뀌어도 기존 항목 · 수량 · 수동 수정은 그대로, 경고만 표시', () => {
    I.setCartQty('SB101', 77); // 수동 수정
    build(S(), SALES(true), {g1: G(['SB101', 'SB102'])}); // 이제 대표 SB102
    expect(a.ui.cart.get('SB101')).toBe(77); expect(a.ui.cart.has('SB102')).toBe(false); expect(a.ui.cartMeta.get('SB101').calc).toBe(200);
    const w = I.cartRows().find(r => r.pn === 'SB101').warnings.join(' | ');
    expect(w).toMatch(/그룹의 이전 SKU 입니다 \(현재 대표 SB102\)/); expect(w).toMatch(/담을 때 대표 SKU\(SB101\)와 현재 대표\(SB102\)가 다릅니다/);
    // 새 대표를 담으면 중복 경고 (병합 · 삭제 없음)
    const r = I.addToCart('SB102'); expect(r.warnings.join()).toMatch(/같은 그룹\(세럼\)의 다른 SKU 가 이미 발주 목록에 있습니다 — SB101/);
    expect(a.ui.cart.get('SB101')).toBe(77); expect(a.ui.cart.has('SB102')).toBe(true);
    expect(I.cartRows().find(r => r.pn === 'SB101').warnings.join()).toMatch(/같은 그룹\(세럼\)의 다른 SKU 도 발주 목록에 있음: SB102/);
    // 그룹을 지워도 담긴 항목은 그대로 (경고만)
    build(S(), SALES(true), {}); expect(a.ui.cart.get('SB101')).toBe(77); expect(a.ui.cart.size).toBe(2);
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
  it('이전 SKU 로 찾아도(검색 · 상세) 개별 항목을 보여 주고, 대표는 그룹 항목', () => {
    build(S(), SALES(false), {g1: G(['SB101', 'SB102'])});
    expect(I.findForecast('SB101').group).toBeDefined(); expect(I.findForecast('SB102').group).toBeUndefined(); // SB102 는 개별 항목
    expect(I.searchProducts('SB102').map(x => x.품번)).toContain('SB102');
    expect(I.productDetail('SB101').monthTotal).toBe(200); // 대표 상세의 월별 판매는 멤버 합산
  });
  it('저장된 보기 · 히어로 · 마스크 설정은 품번 기준이라 그룹과 충돌하지 않음', async () => {
    build(S(), SALES(false), {g1: G(['SB101', 'SB102'])}, {hero: {SB102: {minQty: 5}}, mask: {SB102: true}});
    a.ui.forecastCategory = 'hero'; I.saveView('히어로'); a.ui.forecastCategory = 'all'; I.applyView('히어로');
    expect(a.ui.forecastCategory).toBe('hero'); expect(a.forecastModel().list.map(x => x.품번)).toEqual(['SB101']); I.deleteView('히어로'); a.ui.forecastCategory = 'all';
  });
});

describe('SKU 가 둘 이상의 확정 그룹에 속하면: 순서와 무관하게 관련 그룹 모두 제외, 개별 계산 유지', () => {
  const S = () => [sku('SB101', NA, 40), sku('SB102', GL, 25), sku('SB103', '세럼 (유럽)', 10), sku('SB201', '토너 (북미)', 5), sku('SB202', '토너 (글로벌)', 8)];
  const SALES = () => [sale('A', 'SB101', 100, d(2, 10)), sale('A', 'SB102', 150, d(2, 20)), sale('A', 'SB103', 60, d(3)), sale('A', 'SB201', 30, d(2, 10)), sale('A', 'SB202', 50, d(2, 20))];
  const snap = () => JSON.stringify(a.state.forecast.map(x => [x.품번, x.target, x.orderQty, x.grade, x.available, x.incoming, !!x.group]).sort());
  const OVERLAP = (first, second) => ({[first]: G(['SB101', 'SB102'], {name: '세럼A'}), [second]: G(['SB102', 'SB103'], {name: '세럼B'}), g5: G(['SB201', 'SB202'], {name: '토너'})});
  it('겹친 두 그룹은 모두 적용 안 됨(충돌 표시), 멤버는 개별 계산으로 보이고 겹치지 않는 그룹은 그대로 적용', () => {
    build(S(), SALES(), {g5: G(['SB201', 'SB202'], {name: '토너'})}); const onlyToner = snap();
    build(S(), SALES(), OVERLAP('g1', 'g2'));
    expect(a.state.groupStatus.g1).toMatchObject({applied: false, conflict: true}); expect(a.state.groupStatus.g2).toMatchObject({applied: false, conflict: true});
    expect(a.state.groupStatus.g1.reason).toMatch(/SB102/); expect(a.state.groupStatus.g5.applied).toBe(true); // 영향 없는 그룹 보존
    expect(a.state.groupConflicts).toEqual([{pn: 'SB102', groups: [{id: 'g1', name: '세럼A'}, {id: 'g2', name: '세럼B'}]}]);
    expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB101', 'SB102', 'SB103', 'SB202']); // 세럼 3개는 개별, 토너는 그룹(대표 SB202) 한 줄
    // 개별 계산 = 그룹 없이 계산한 값과 같음 (중복 계산 · 누락 없음)
    build(S(), SALES(), {g5: G(['SB201', 'SB202'], {name: '토너'})});
    const indiv = Object.fromEntries(a.state.forecast.map(x => [x.품번, [x.target, x.orderQty, x.available, x.incoming]]));
    build(S(), SALES(), OVERLAP('g1', 'g2')); a.state.forecast.filter(x => ['SB101', 'SB102', 'SB103'].includes(x.품번)).forEach(x => expect([x.target, x.orderQty, x.available, x.incoming]).toEqual(indiv[x.품번]));
    expect(a.state.forecast.every(x => !['SB101', 'SB102', 'SB103'].includes(x.품번) || x.group === undefined)).toBe(true);
    expect(onlyToner.includes('SB202')).toBe(true);
  });
  it('그룹 순서를 바꿔도 결과가 완전히 같음 (id 순서 · 저장 순서와 무관)', () => {
    build(S(), SALES(), OVERLAP('g1', 'g2')); const a1 = snap(), c1 = JSON.stringify(a.state.groupConflicts.map(c => [c.pn, c.groups.map(g => g.name).sort()]));
    build(S(), SALES(), OVERLAP('g2', 'g1')); const a2 = snap(), c2 = JSON.stringify(a.state.groupConflicts.map(c => [c.pn, c.groups.map(g => g.name).sort()]));
    build(S(), SALES(), OVERLAP('z9', 'a1')); const a3 = snap();
    expect(a2).toBe(a1); expect(a3).toBe(a1); expect(c2).toBe(c1);
    ['g1', 'g2', 'a1', 'z9'].forEach(id => { if (a.state.groupStatus[id]) expect(a.state.groupStatus[id].applied).toBe(false); });
  });
  it('연쇄 겹침(A-B, B-C, C-D)도 겹친 SKU 가 속한 모든 그룹을 제외', () => {
    build([sku('SB101', NA, 1), sku('SB102', GL, 1), sku('SB103', '세럼 (유럽)', 1), sku('SB104', '세럼 (일본)', 1)], [sale('A', 'SB101', 5, d(1)), sale('A', 'SB102', 5, d(1)), sale('A', 'SB103', 5, d(1)), sale('A', 'SB104', 5, d(1))],
      {g1: G(['SB101', 'SB102']), g2: G(['SB102', 'SB103']), g3: G(['SB103', 'SB104'])});
    ['g1', 'g2', 'g3'].forEach(id => expect(a.state.groupStatus[id].applied).toBe(false));
    expect(a.state.groupConflicts.map(c => c.pn)).toEqual(['SB102', 'SB103']); expect(a.state.forecast.length).toBe(4);
  });
  it('충돌 해결: 한 그룹에서 SKU 를 빼면 두 그룹 모두 적용, 그룹을 지워도 남은 그룹 적용', () => {
    build(S(), SALES(), OVERLAP('g1', 'g2')); expect(a.state.groupConflicts.length).toBe(1);
    build(S(), SALES(), {g1: G(['SB101', 'SB102'], {name: '세럼A'}), g2: G(['SB103', 'SB101x'], {name: '세럼B'}), g5: G(['SB201', 'SB202'])}); // g2 에서 SB102 제거(남은 멤버 1개 → 적용 안 됨은 충돌 아님)
    expect(a.state.groupConflicts).toEqual([]); expect(a.state.groupStatus.g1.applied).toBe(true); expect(a.state.groupStatus.g2.applied).toBe(false); expect(a.state.groupStatus.g2.conflict).toBeUndefined();
    build(S(), SALES(), {g1: G(['SB101', 'SB102'], {name: '세럼A'}), g5: G(['SB201', 'SB202'])}); // g2 삭제
    expect(a.state.groupConflicts).toEqual([]); expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB102', 'SB103', 'SB202']);
  });
  it('데이터에 없는 멤버가 겹쳐도 충돌로 처리하고, 발주 목록 항목은 그대로 + 경고만', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), {g1: G(['SB101', 'SB102']), g5: G(['SB201', 'SB202'])});
    I.addToCart('SB102'); const qty = a.ui.cart.get('SB102'); const meta = JSON.stringify(a.ui.cartMeta.get('SB102'));
    build(S(), SALES(), {g1: G(['SB101', 'SB102']), g2: G(['SB102', 'GONE']), g5: G(['SB201', 'SB202'])}); // GONE 은 데이터에 없지만 SB102 가 겹침
    expect(a.state.groupConflicts.map(c => c.pn)).toEqual(['SB102']);
    expect(a.ui.cart.get('SB102')).toBe(qty); expect(JSON.stringify(a.ui.cartMeta.get('SB102'))).toBe(meta); expect(a.ui.cart.size).toBe(1);
    expect(I.cartRows().find(r => r.pn === 'SB102').warnings.join()).toMatch(/여러 그룹에 속해 있어 그룹 계산에서 제외/);
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
  it('충돌 목록 · 그룹별 적용 안 됨 사유가 계산 상태에 남음 (경고 · 발주 목록 표시에 사용)', () => {
    build(S(), SALES(), OVERLAP('g1', 'g2'));
    expect(a.state.groupConflicts.map(c => c.pn)).toEqual(['SB102']);
    expect(['g1', 'g2'].every(id => !a.state.groupStatus[id].applied && /SKU 충돌/.test(a.state.groupStatus[id].reason))).toBe(true);
    expect(a.state.groupStatus.g5.applied).toBe(true);
  });
});

describe('자동 그룹: 근거가 확실한 포장 개정만 승인 없이, 나머지는 검토', () => {
  const BC = (n, suffix = '') => '88000000' + n + suffix;
  const keys = () => a.state.forecast.map(x => x.key || x.품번).sort();
  const SALES = pns => pns.map((pn, i) => sale('A', pn, 50, d(2, 10 + i)));
  it('같은 핵심 이름 · 같은 바코드(접미사 제외) · 지역 표기만 다른 SKU 는 자동 그룹, 이름만 같은 SKU 는 자동 아님', () => {
    build([sku('SB101', '세럼 (북미)', 10, {barcode: BC('01')}), sku('SB102', '세럼 (북미/유럽)', 10, {barcode: BC('01', '-1')}), sku('SB103', '세럼 (글로벌)', 10, {barcode: BC('01', '-2')}),
      sku('SB201', '로션 (북미)', 5, {barcode: BC('11')}), sku('SB202', '로션 (글로벌)', 5, {barcode: BC('12')})], SALES(['SB101', 'SB102', 'SB103', 'SB201', 'SB202']), {});
    expect(Object.keys(a.state.autoGroupDefs)).toHaveLength(1); // 세럼만 (로션은 바코드가 달라 이름만 일치 → 수동 검토)
    const g = a.state.forecast.find(x => x.key && x.key.startsWith('group:auto:'));
    expect(g.group.auto).toBe(true); expect(g.group.members.map(m => m.pn).sort()).toEqual(['SB101', 'SB102', 'SB103']); expect(g.memberPns.length).toBe(3);
    expect(a.state.forecast.map(x => x.품번)).toEqual(expect.arrayContaining(['SB201', 'SB202'])); // 로션은 개별 그대로
    expect(a.state.forecast.length).toBe(3); // 세럼 1 + 로션 2
    expect(Object.values(a.state.groupStatus).filter(s => s.auto && s.applied).length).toBe(1);
    expect(SG.buildCandidates().filter(c => !c.auto).map(c => c.core)).toEqual(['로션']); // 자동 그룹이 아닌 후보(이름만 일치)는 개별로 남음
    expect(Object.keys(a.state.autoGroupDefs).length).toBe(1);
  });
  it('TARGET · TJX · 일반은 서로 섞이지 않음: 같은 종류끼리만 자동 그룹', () => {
    build([sku('SB101', '세럼 (북미)', 1, {barcode: BC('21')}), sku('SB102', '세럼 (글로벌)', 1, {barcode: BC('21', '-1')}),
      sku('SB201', '세럼 (TARGET)', 1, {barcode: BC('22')}), sku('SB202', '세럼 (TARGET 북미)', 1, {barcode: BC('22', '-1')}),
      sku('SB301', '세럼 (TJX)', 1, {barcode: BC('23')}), sku('SB302', '세럼 (TJX 글로벌)', 1, {barcode: BC('23', '-1')})], SALES(['SB101', 'SB102', 'SB201', 'SB202', 'SB301', 'SB302']), {});
    const defs = Object.values(a.state.autoGroupDefs);
    expect(defs.map(g => g.members.slice().sort().join('+')).sort()).toEqual(['SB101+SB102', 'SB201+SB202', 'SB301+SB302']);
    expect(defs.map(g => g.name).sort()).toEqual(['세럼', '세럼 (TARGET)', '세럼 (TJX)']);
    expect(a.state.forecast.length).toBe(3);
  });
  it('자동 그룹 충돌 · 상품 정보 충돌은 자동 적용 안 함: 같은 바코드를 이름이 다른 상품이 씀, 규격 불일치, 알 수 없는 표기, TARGET 이 일반과 같은 바코드', () => {
    build([sku('SB101', '세럼 (북미)', 1, {barcode: BC('31')}), sku('SB102', '세럼 (글로벌)', 1, {barcode: BC('31', '-1')}), sku('SB103', '토너', 1, {barcode: BC('31', '-2')}), // 같은 바코드를 다른 이름 상품도 사용
      sku('SB201', '크림 (북미)', 1, {barcode: BC('32')}), sku('SB202', '크림 (한정판)', 1, {barcode: BC('32', '-1')}), // 알 수 없는 표기
      sku('SB301', '앰플 (북미)', 1, {barcode: BC('33')}), sku('SB302', '앰플 (TARGET)', 1, {barcode: BC('33', '-1')})], // 일반과 TARGET 이 같은 바코드
      SALES(['SB101', 'SB102', 'SB103', 'SB201', 'SB202', 'SB301', 'SB302']), {});
    expect(Object.keys(a.state.autoGroupDefs)).toEqual([]); expect(a.state.forecast.length).toBe(7); // 전부 개별 계산 유지
    const c = SG.buildCandidates(); expect(c.length).toBeGreaterThan(0); c.forEach(x => expect(x.auto).toBe(false));
    expect(c.find(x => x.core === '세럼').warnings.join()).toMatch(/상품 정보 충돌/); expect(c.find(x => x.core === '크림').warnings.join()).toMatch(/알 수 없는 괄호 표기/);
    // 마스터 규격이 서로 다르면 자동 아님
    build([sku('SB401', '로션 (북미)', 1, {barcode: BC('41')}), sku('SB402', '로션 (글로벌)', 1, {barcode: BC('41', '-1')})], SALES(['SB401', 'SB402']), {});
    a.state.productMaster = [{품번: 'SB401', 제품W: 5, 제품D: 5, 제품H: 9, 제품무게g: 100, 인입수: 10}, {품번: 'SB402', 제품W: 5, 제품D: 5, 제품H: 12, 제품무게g: 100, 인입수: 10}]; a.computeDerived();
    expect(Object.keys(a.state.autoGroupDefs)).toEqual([]); expect(SG.buildCandidates()[0].strength).toBe('확인 필요');
  });
  it('수동 그룹 · 거절 규칙 · 기존 설정 보존: 수동 그룹 멤버는 자동 그룹에서 빠지고, 거절한 후보는 자동 그룹이 되지 않음, 수동 대표 · 호환은 그대로', () => {
    const S = () => [sku('SB101', '세럼 (북미)', 10, {barcode: BC('51')}), sku('SB102', '세럼 (글로벌)', 20, {barcode: BC('51', '-1')}), sku('SB103', '세럼 (유럽)', 30, {barcode: BC('51', '-2')})];
    build(S(), SALES(['SB101', 'SB102', 'SB103']), {}); expect(Object.keys(a.state.autoGroupDefs).length).toBe(1);
    // 수동 그룹 {SB101,SB102}(대표 수동, 호환) 이 있으면 SB103 은 혼자 → 자동 그룹 없음, 수동 설정 그대로
    build(S(), SALES(['SB101', 'SB102', 'SB103']), {g1: G(['SB101', 'SB102'], {rep: 'SB101', compat: ['SB102']})});
    expect(Object.keys(a.state.autoGroupDefs)).toEqual([]); const x = row('SB101'); expect([x.group.auto, x.group.repManual, x.available]).toEqual([false, true, 30]); // 10 + 호환 20
    expect(a.state.forecast.map(v => v.품번).sort()).toEqual(['SB101', 'SB103']);
    // 거절하면 자동 그룹이 되지 않음 → 세 SKU 개별
    a.settings.skuRejected = [SG.candidateKey(['SB101', 'SB102', 'SB103'])]; build(S(), SALES(['SB101', 'SB102', 'SB103']), {}); a.settings.skuRejected = ['SB101+SB102+SB103'];
    a.computeDerived(); expect(a.state.forecast.length).toBe(3); expect(Object.keys(a.state.autoGroupDefs)).toEqual([]);
    a.settings.skuRejected = [];
  });
  it('자동 그룹도 중복 없이: 판매 · 재고 한 번씩, 자동 그룹은 대표 재고만, 개별 SKU 항목은 보존', () => {
    build([sku('SB101', '세럼 (북미)', 10, {barcode: BC('61'), incoming: 4, incDate: '2999-01-01'}), sku('SB102', '세럼 (글로벌)', 20, {barcode: BC('61', '-1'), incoming: 6, incDate: '2999-01-01'})],
      [sale('A', 'SB101', 100, d(2, 10)), sale('A', 'SB102', 150, d(2, 20))], {});
    const g = a.state.forecast[0]; expect(a.state.forecast.length).toBe(1);
    expect([g.target, g.group.rep, g.available, g.incoming, g.orderQty]).toEqual([250, 'SB102', 20, 6, 224]); // 대표(최근 SB102) 재고만
    expect(g.monthTotals.reduce((s, v) => s + v, 0)).toBe(250); expect(a.state.forecastSku.length).toBe(2);
  });
  it('자동 그룹이 생기거나 사라져도 기존 발주 목록 항목 · 수량 · 스냅샷은 그대로 (경고만)', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear();
    const S = () => [sku('SB101', '세럼 (북미)', 10, {barcode: BC('71')}), sku('SB102', '세럼 (글로벌)', 20, {barcode: BC('71', '-1')})];
    build(S().map(s => ({...s, barcode: s.barcode.replace('-1', '9')})), SALES(['SB101', 'SB102']), {}); // 바코드가 달라 자동 그룹 없음 → 개별로 담기
    I.addManyToCart(['SB101']); I.setCartQty('SB101', 55); const meta = JSON.stringify(a.ui.cartMeta.get('SB101'));
    build(S(), SALES(['SB101', 'SB102']), {}); // 이제 자동 그룹 (대표 SB102)
    expect(a.state.forecast.length).toBe(1); expect(a.ui.cart.get('SB101')).toBe(55); expect(JSON.stringify(a.ui.cartMeta.get('SB101'))).toBe(meta);
    expect(I.cartRows().find(r => r.pn === 'SB101').warnings.join()).toMatch(/그룹의 이전 SKU 입니다 \(현재 대표 SB102\)/);
    const r = I.addManyToCart(['group:auto:SB101+SB102']); expect(r.warnings.join()).toMatch(/같은 그룹\(세럼\)의 다른 SKU 가 이미 발주 목록에 있습니다 — SB101/); expect(a.ui.cart.get('SB101')).toBe(55);
    a.settings.skuRejected = ['SB101+SB102']; a.computeDerived(); expect(a.state.forecast.length).toBe(2); expect(a.ui.cart.get('SB101')).toBe(55); expect(a.ui.cart.size).toBe(2); // 제외해도 그대로
    a.settings.skuRejected = []; a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
});

describe('SKU 선택 필요(고객마다 대표가 다름) 그룹: 잠정 수치 · 선택 후 재계산 · 담기 차단 · 보존', () => {
  const S = () => [sku('SB101', NA, 40, {incoming: 10, incDate: '2999-01-01'}), sku('SB102', GL, 25, {incoming: 5, incDate: '2999-01-01'})];
  const SALES = () => [sale('A', 'SB101', 100, d(1, 20)), sale('B', 'SB102', 70, d(1, 10))]; // 같은 달 합산 170, A=SB101 · B=SB102, 전체 최근 = SB101
  const grp = () => a.state.forecast.find(x => x.key === 'group:g1');
  it('임시 SKU 재고 기준의 잠정 수치로 표시(provisional), 확정 수치가 아님', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    const x = grp(); expect(x.group.pending).not.toBeNull(); expect(x.provisional).toBe(true);
    expect([x.group.rep, x.available, x.incoming, x.orderQty]).toEqual(['SB101', 40, 10, 120]); // 임시 SKU(전체 최근) 재고 기준
    expect(x.group.members.find(m => m.pn === 'SB101').isRep).toBe(true); expect(a.forecastModel().provisionalCount).toBe(1);
    a.ui._forecastCsvRows = [x]; expect(a.forecastListCsv().csv).toContain('잠정(SKU 선택 필요)');
    a.ui.forecastCustomers = new Set(['B']); expect(a.forecastModel().list.find(r => r.key === 'group:g1').provisional).toBe(false); // 고객 1곳이면 확정
    a.ui.forecastCustomers = new Set();
  });
  it('SKU 를 고르면 선택 SKU + 호환 SKU 만으로 재고 · 입고예정 · 부족 수량을 다시 계산 (미리보기는 발주 목록을 건드리지 않음)', async () => {
    const R = await import('./groupcalc.js'); a.ui.cart.clear(); a.ui.cartMeta.clear();
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])});
    const p = R.rebuildGroupItem(grp(), a.ui.forecastCustomers, 'SB102'); // 담기 전 미리보기
    expect(p).toMatchObject({품번: 'SB102', provisional: false, available: 25, incoming: 5, orderQty: 140}); expect(p.group.pending).toBeNull(); expect(p.group.repBasis).toMatch(/직접 선택/);
    expect(a.ui.cart.size).toBe(0); expect(a.ui.cartMeta.size).toBe(0);
    // 호환 확인: 선택 SKU + 호환만, 임시였던 SB101 이 호환이면 한 번만 (두 번 세지 않음)
    build(S(), SALES(), {g1: G(['SB101', 'SB102'], {compat: ['SB101', 'SB102']})});
    const q = R.rebuildGroupItem(grp(), a.ui.forecastCustomers, 'SB102'); expect([q.available, q.incoming, q.orderQty]).toEqual([65, 15, 90]); // 25+40, 5+10
    const t = R.rebuildGroupItem(grp(), a.ui.forecastCustomers, 'SB101'); expect([t.available, t.incoming, t.orderQty]).toEqual([65, 15, 90]); // 어느 쪽을 골라도 같은 SKU 는 한 번씩
    build(S(), SALES(), {g1: G(['SB101', 'SB102'])}); // 호환 없음: 임시 SKU(SB101) 재고는 들어가지 않음
    expect(R.rebuildGroupItem(grp(), a.ui.forecastCustomers, 'SB102').available).toBe(25);
  });
  it('일괄 담기는 선택 필요 그룹을 막고(건너뜀), 직접 선택해 담으면 재계산 값 · 스냅샷으로 담기며 기존 항목은 그대로', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S().concat([sku('SB900', '토너', 5)]), SALES().concat([sale('A', 'SB900', 50, d(1))]), {g1: G(['SB101', 'SB102'])});
    I.addManyToCart(['SB900']); I.setCartQty('SB900', 33); const before = JSON.stringify([...a.ui.cart.entries(), ...a.ui.cartMeta.entries()]);
    const r = I.addManyToCart(['group:g1', 'SB900']); expect(r).toMatchObject({added: 0, existing: 1, pending: ['세럼']}); expect(JSON.stringify([...a.ui.cart.entries(), ...a.ui.cartMeta.entries()])).toBe(before); // 차단 + 기존 불변
    const x = grp(); expect(I.addItemToCart(x)).toMatchObject({added: false, pending: true});
    expect(I.addItemToCart(x, 'SB102')).toMatchObject({added: true});
    expect(a.ui.cart.get('SB102')).toBe(140); expect(a.ui.cartMeta.get('SB102')).toMatchObject({calc: 140, group: {id: 'g1', rep: 'SB102', basis: '발주 SKU 를 직접 선택'}}); // 확정 재계산 값 저장 (임시 120 아님)
    expect(a.ui.cart.get('SB900')).toBe(33); expect(I.addItemToCart(x, 'SB102')).toMatchObject({added: false}); expect(a.ui.cart.get('SB102')).toBe(140); // 다시 담아도 유지
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
});
