// 상품 그룹 2단계: 확정된 그룹만 계산에 반영 — 판매 합산 · 대표 SKU 고정 · 재고(대표 + 호환만, 한 번씩) · 미판매 · 히어로/마스크 · 발주 목록 · 이상값
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, I;
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
  a = (await loadPort()).api; I = await import('./insights.js');
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

describe('거래처 필터: 선택 거래처의 판매만, 대표 SKU 는 고정', () => {
  it('선택 거래처 합산 · 대표는 전체 거래처 기준 그대로', () => {
    // C 는 오래된 SB101 만 샀고, 최근 판매(전체)는 SB102 → 대표 SB102 고정
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [sale('C', 'SB101', 80, d(2)), sale('C', 'SB101', 60, d(2, 20)), sale('A', 'SB102', 300, d(1))], {g1: G(['SB101', 'SB102'])});
    expect(row('SB102').group.rep).toBe('SB102'); expect(row('SB102').target).toBe(300);
    a.ui.forecastCustomers = new Set(['C']); let m = a.forecastModel(); let x = m.list.find(r => r.품번 === 'SB102');
    expect(x.group.rep).toBe('SB102'); expect([x.target, x.scoped]).toEqual([140, true]); // C 의 SB101 판매 합계 (대표 SKU 와 다른 멤버의 판매)
    a.ui.forecastCustomers = new Set(['A']); x = a.forecastModel().list.find(r => r.품번 === 'SB102'); expect(x.target).toBe(300);
    a.ui.forecastCustomers = new Set(['A', 'C']); x = a.forecastModel().list.find(r => r.품번 === 'SB102'); expect(x.target).toBe(300); // 월 최대: 2달 전 C 140, 1달 전 A 300
    a.ui.forecastCustomers = new Set(['Z']); expect(a.forecastModel().list.some(r => r.품번 === 'SB102')).toBe(false); // 그 거래처가 안 산 그룹은 안 보임
    // 월별 열(올해)도 선택 거래처의 멤버 합산
    a.ui.forecastCustomers = new Set(['C']); m = a.forecastModel(); const idx = d(2).getFullYear() === m.year ? d(2).getMonth() : -1;
    if (idx >= 0) expect(m.monthly(m.list.find(r => r.품번 === 'SB102'))[idx]).toBe(140);
    a.ui.forecastCustomers = new Set();
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
  it('자동 대표를 정할 수 없으면(동률 · 판매 전무) 그룹을 적용하지 않고 개별 계산 + 사유', () => {
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [sale('A', 'SB101', 10, d(2)), sale('A', 'SB102', 10, d(2))], {g1: G(['SB101', 'SB102'])});
    expect(a.state.groupStatus.g1).toMatchObject({applied: false}); expect(a.state.groupStatus.g1.reason).toMatch(/대표 SKU/);
    expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB101', 'SB102']);
    build([sku('SB101', NA, 0), sku('SB102', GL, 0)], [], {g1: G(['SB101', 'SB102'])}); expect(a.state.groupStatus.g1.applied).toBe(false);
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
  it('한 SKU 는 한 그룹에만: 겹치면 먼저 처리한 그룹이 가져가고 나머지는 적용 안 됨', () => {
    build(S(), SALES(), {g1: G(['SB101', 'SB102']), g2: G(['SB102', 'SB103'])});
    expect(a.state.groupStatus.g1.applied).toBe(true); expect(a.state.groupStatus.g2.applied).toBe(false);
    expect(a.state.forecast.map(x => x.품번).sort()).toEqual(['SB102', 'SB103']);
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
    const ov = a.overviewModel(); expect(ov.total).toBe(2);
    expect(a.customerShortRows().find(r => r.cust === 'A')).toMatchObject({items: 2, short: 2});
    expect(a.ui.forecastVisiblePns.slice().sort()).toEqual(m.list.map(x => x.품번).sort());
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
