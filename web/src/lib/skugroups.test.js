// 상품 그룹 1단계: 이름 해석 · 후보 생성(TARGET/TJX 분리) · 대표 SKU 제안 · 검사 · 확정/거절 반영 · 계산에 영향 없음
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, G;
const D = back => new Date(new Date(NOW).getFullYear(), new Date(NOW).getMonth(), 10 - back);
const item = (pn, name, extra = {}) => ({품번: pn, 품명: name, 바코드: '', brand: '성분에디터', available: 10, incoming: 0, lastSale: null, hero: false, mask: false, ...extra});
const sale = (cust, qty, when) => ({거래처: cust, 수량: qty, 실적일자: when});
function setup(items, sales = {}, master = {}) {
  a.state.forecast = items; a.state.loaded = true;
  a.state.salesRowsByProduct = new Map(Object.entries(sales));
  a.state.masterByProduct = new Map(Object.entries(master));
  a.settings.skuGroups = {}; a.settings.skuRejected = [];
}
beforeAll(async () => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  a = (await loadPort()).api; G = await import('./skugroups.js');
});
afterAll(() => vi.useRealTimers());

describe('이름 해석', () => {
  it('지역 · 고객 전용 표기를 읽고 핵심 이름을 만듦', () => {
    expect(G.parseSkuName('세트 A (북미/유럽)')).toMatchObject({core: '세트 a', region: ['북미', '유럽'], customer: [], variant: '일반'});
    expect(G.parseSkuName('세트 A (글로벌)')).toMatchObject({core: '세트 a', variant: '일반'});
    expect(G.parseSkuName('세트 A (TARGET)')).toMatchObject({core: '세트 a', customer: ['TARGET'], variant: 'TARGET'});
    expect(G.parseSkuName('세트 A TJX')).toMatchObject({core: '세트 a', variant: 'TJX'}); // 괄호 밖 표기
    expect(G.parseSkuName('세트 A (TARGET/TJX)').variant).toBe('충돌');
    expect(G.parseSkuName('세트 A (한정판)').unknown).toEqual(['한정판']); // 알 수 없는 표기는 따로 기록
  });
});

describe('후보 생성: 이름만으로 확정하지 않고, 고객 전용은 서로 · 일반과 섞지 않음', () => {
  const ITEMS = () => [
    item('SB101', '세럼 (북미)', {바코드: '8801-1'}), item('SB102', '세럼 (북미/유럽)', {바코드: '8801'}), item('SB103', '세럼 (글로벌)'),
    item('SB201', '세럼 (TARGET)'), item('SB202', '세럼 (TARGET 북미)'),
    item('SB301', '세럼 (TJX)'), item('SB302', '세럼 (TJX 글로벌)'),
    item('MT901', '클렌저'), item('MT902', '클렌저 (한정판)'),
  ];
  it('(핵심 이름, 고객 전용 종류)별로 후보를 만들고 TARGET · TJX · 일반은 서로 다른 후보', () => {
    setup(ITEMS());
    const c = G.buildCandidates();
    const sets = c.map(x => x.infos.map(i => i.pn));
    expect(sets).toContainEqual(['SB101', 'SB102', 'SB103']);
    expect(sets).toContainEqual(['SB201', 'SB202']);
    expect(sets).toContainEqual(['SB301', 'SB302']);
    expect(sets.flat().filter(pn => ['SB201', 'SB301'].includes(pn)).length).toBe(2);
    c.forEach(x => expect(new Set(x.infos.map(i => i.variant)).size).toBe(1)); // 한 후보 안에 서로 다른 종류가 없음
    expect(c.find(x => x.variant === 'TARGET').infos.some(i => i.variant !== 'TARGET')).toBe(false);
    const mt = c.find(x => x.infos.some(i => i.pn === 'MT901')); // '(한정판)' 은 알 수 없는 표기 → 후보에는 오르되 '확인 필요' 경고
    expect(mt.strength).toBe('확인 필요'); expect(mt.warnings.join()).toMatch(/알 수 없는 괄호 표기: 한정판/);
  });
  it('근거 표시: 바코드 같음 · 규격 일치/불일치 · 이름만 — 모두 후보일 뿐 자동 확정 없음', () => {
    setup([item('SB101', '세럼 (북미)', {바코드: '8801-1'}), item('SB102', '세럼 (글로벌)', {바코드: '8801-2'}), item('SB105', '로션 (북미)'), item('SB106', '로션 (글로벌)'), item('SB107', '토너 (북미)'), item('SB108', '토너 (글로벌)')],
      {}, {SB107: {제품W: 5, 제품D: 5, 제품H: 9, 제품무게g: 100, 인입수: 10}, SB108: {제품W: 5, 제품D: 5, 제품H: 12, 제품무게g: 100, 인입수: 10}});
    const c = G.buildCandidates(); const by = k => c.find(x => x.core === k);
    expect(by('세럼')).toMatchObject({sameBarcode: true, strength: '근거 있음'});
    expect(by('로션').strength).toBe('이름만 일치');
    expect(by('토너')).toMatchObject({specDiffers: true, strength: '확인 필요'}); expect(by('토너').warnings.join()).toMatch(/규격/);
    expect(Object.keys(a.settings.skuGroups)).toEqual([]); // 후보 생성만으로 그룹이 만들어지지 않음
  });
  it('이미 확정한 품번은 후보에서 빠지고, 거절한 후보는 다시 나오지 않음(구성이 바뀌면 다시 나옴)', () => {
    setup(ITEMS());
    a.settings.skuGroups = {g1: {name: 'x', members: ['SB101', 'SB102', 'SB103'], rep: null, compat: []}};
    expect(G.buildCandidates().some(x => x.infos.some(i => i.pn === 'SB101'))).toBe(false);
    a.settings.skuGroups = {}; a.settings.skuRejected = [G.candidateKey(['SB201', 'SB202'])];
    expect(G.buildCandidates().some(x => x.variant === 'TARGET')).toBe(false);
    setup([...ITEMS(), item('SB203', '세럼 (TARGET 유럽)')]); a.settings.skuRejected = [G.candidateKey(['SB201', 'SB202'])];
    expect(G.buildCandidates().find(x => x.variant === 'TARGET').infos.length).toBe(3);
  });
});

describe('대표 SKU: 최근 판매실적일 기준 (품번 · 가나다 아님)', () => {
  const I = (pn, last, q3 = 0) => ({pn, lastSale: last, qty3: q3});
  it('가장 늦은 판매일, 품번이 작아도 늦게 팔린 쪽', () => {
    expect(G.suggestRep([I('SB999', D(60)), I('SB001', D(2))])).toMatchObject({pn: 'SB001', reason: '최근 판매실적일 기준'});
  });
  it('판매 이력이 하나도 없으면 자동 지정하지 않음 · 이력 없는 최신 SKU 는 대표가 아님', () => {
    expect(G.suggestRep([I('A', null), I('B', null)]).pn).toBeNull();
    expect(G.suggestRep([I('NEW', null), I('OLD', D(100))]).pn).toBe('OLD');
  });
  it('같은 날짜면 직전 3개월 판매량이 큰 쪽, 그래도 같으면 자동 지정 안 함', () => {
    expect(G.suggestRep([I('A', D(5), 10), I('B', D(5), 30)]).pn).toBe('B');
    const t = G.suggestRep([I('A', D(5), 10), I('B', D(5), 10)]); expect(t.pn).toBeNull(); expect(t.tie).toEqual(['A', 'B']);
  });
  it('잘못된 날짜 · 판매 없는 줄은 날짜로 안 침 (skuInfo 는 forecast 의 마지막 판매일 사용)', () => {
    expect(G.suggestRep([I('A', new Date(NaN)), I('B', D(30))]).pn).toBe('B');
  });
});

describe('묶기 검사', () => {
  it('고객 전용은 서로 · 일반과 섞을 수 없음, 없는 품번 · 1개는 거절', () => {
    setup([item('S1', '세럼 (북미)'), item('S2', '세럼 (글로벌)'), item('T1', '세럼 (TARGET)'), item('J1', '세럼 (TJX)'), item('X1', '세럼 (TARGET/TJX)')]);
    expect(G.validateMembers(['S1', 'S2']).ok).toBe(true);
    expect(G.validateMembers(['S1', 'T1']).errors.join()).toMatch(/고객 전용 SKU 는 서로/);
    expect(G.validateMembers(['T1', 'J1']).ok).toBe(false); // TARGET + TJX 는 절대 불가
    expect(G.validateMembers(['X1', 'T1']).errors.join()).toMatch(/TARGET · TJX 표기가 함께/);
    expect(G.validateMembers(['S1', 'NOPE']).errors.join()).toMatch(/데이터에 없는/);
    expect(G.validateMembers(['S1']).ok).toBe(false);
  });
});

describe('확정 그룹 보기: 대표 · 재고 호환 · 경고', () => {
  const mk = (rep, compat = []) => { a.settings.skuGroups = {g1: {name: '세럼', members: ['A', 'B', 'C'], rep, compat}}; return G.groupView('g1'); };
  it('자동 대표(최근 판매실적일), 수동 지정이 우선, 이전 SKU 재고는 따로 · 호환 확인한 것만 included', () => {
    setup([item('A', '세럼 (북미)', {lastSale: D(40), available: 50, incoming: 5}), item('B', '세럼 (글로벌)', {lastSale: D(3), available: 7, incoming: 2}), item('C', '세럼 (북미/유럽)', {lastSale: null, available: 90})]);
    let v = mk(null); expect(v).toMatchObject({rep: 'B', repManual: false});
    expect(v.prevStock.map(p => [p.pn, p.available, p.included])).toEqual([['A', 50, false], ['C', 90, false]]); // 기본은 합치지 않음
    v = mk('C', ['A', 'B', 'C']); // 판매 이력 없는 새 버전을 수동 대표로
    expect(v).toMatchObject({rep: 'C', repManual: true}); expect(v.warnings.join()).toMatch(/판매 이력이 없습니다/); expect(v.warnings.join()).toMatch(/자동 제안\(B\)/);
    expect([...v.compat].sort()).toEqual(['A', 'B']); // 대표 본인은 호환 목록에서 제외
    expect(v.prevStock.every(p => p.included)).toBe(true);
    v = mk('Z'); expect(v.rep).toBe('B'); // 멤버가 아닌 수동 값은 무시
  });
  it('발주 목록에 담긴 멤버가 있으면 자동 변경 없이 경고만', async () => {
    await import('./insights.js'); // 발주 목록 상태(ui.cart)를 만드는 모듈
    setup([item('A', '세럼 (북미)', {lastSale: D(3)}), item('B', '세럼 (글로벌)', {lastSale: D(1)}), item('C', '세럼 (유럽)')]);
    a.ui.cart.clear(); a.ui.cart.set('A', 120);
    const v = mk(null); expect(v.warnings.join()).toMatch(/발주 목록에 이미 담긴 멤버.*A\(120\)/);
    expect(a.ui.cart.get('A')).toBe(120); a.ui.cart.clear();
  });
});

describe('1단계는 계산을 바꾸지 않음', () => {
  it('그룹을 확정 · 대표 지정 · 호환 설정해도 forecast 결과(부족 수량 · 상태 · 목표)가 그대로', async () => {
    const {makeSheets} = await import('./__fixtures__/sheets.js');
    const sh = makeSheets(NOW);
    a.state.inventory = a.parseInventory(sh.inventory); a.state.schedule = a.parseSchedule(sh.schedule); a.state.scheduleMonthLabels = a.state.schedule.monthLabels;
    a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)}; a.state.sales = a.salesForTeam();
    a.state.expiry = a.parseExpiry(sh.expiry); a.state.productMaster = a.parseProductMaster(sh.productMaster); a.settings.skuGroups = {}; a.computeDerived();
    const snap = () => JSON.stringify(a.state.forecast.map(x => [x.품번, x.target, x.orderQty, x.grade, x.available, x.incoming, x.inactiveReason]));
    const before = snap();
    a.settings.skuGroups = {g1: {name: '세트 A', members: ['SB004', 'SB005', 'SB006'], rep: 'SB005', compat: ['SB004', 'SB006']}};
    a.computeDerived(); expect(snap()).toBe(before);
    a.settings.skuGroups = {};
  });
});
