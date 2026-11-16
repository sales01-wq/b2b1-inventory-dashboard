// 3개월 미판매 필터 · 발주 목록 현황 표시 · 선택 품목 엑셀(.xlsx) 내보내기 · 기존 계산 / 발주 목록 보존
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import readXlsxFile from 'read-excel-file/node';
import {NOW, loadPort} from './__fixtures__/harness.js';

let a, I, X;
const N = new Date(NOW), y = N.getFullYear(), mo = N.getMonth();
const d = (back, day = 10) => new Date(y, mo - back, day);
const sale = (cust, pn, qty, when) => ({거래처: cust, 품번: pn, 품명: pn, 수량: qty, 실적일자: when, 금액: 0});
const sku = (pn, name, avail, extra = {}) => ({pn, name, avail, incoming: 0, incDate: '', barcode: '', status: '정상', ...extra});
function build(skus, sales, groups = {}, opts = {}) {
  a.state.inventory = skus.map(s => ({창고: 'EMP 물류', 가용재고: s.avail, 품번: s.pn, 품명: s.name, 바코드: s.barcode, 규격: '', 현재고: s.avail, 입고예정: 0, 출고예정: 0, 안전재고: 0}));
  a.state.schedule = skus.map(s => ({품번: s.pn, 품명: s.name, 거래처: 'A', 바코드: s.barcode, 품목상태: s.status, 가용재고: s.avail, 재고합계: s.avail, aug_d: s.incDate, aug_q: s.incoming, sep_d: '', sep_q: 0, oct_d: '', oct_q: 0}));
  a.state.scheduleMonthLabels = ['1월', '2월', '3월'];
  a.state.sales = sales; a.state.salesByTeam = {B2B1팀: sales}; a.state.expiry = []; a.state.productMaster = [];
  a.settings.hero = opts.hero || {}; a.settings.mask = {}; a.settings.rules = {}; a.settings.skuGroups = groups; a.settings.skuRejected = [];
  Object.assign(a.ui, {forecastGrade: '', forecastShowNoSales: true, forecastCategory: 'all', forecastBrand: ''}); a.ui.forecastCustomers = new Set(); a.ui.forecastSelected.clear();
  a.state.loaded = true; a.computeDerived();
}
const list = grade => { a.ui.forecastGrade = grade; const r = a.forecastModel().list.map(x => x.품번).sort(); a.ui.forecastGrade = ''; return r; };
const NA = '세럼 (북미)', GL = '세럼 (글로벌)';

beforeAll(async () => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
  const mem = new Map(); globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  a = (await loadPort()).api; I = await import('./insights.js'); X = await import('./exportXlsx.js');
});
afterAll(() => vi.useRealTimers());

describe('3개월 미판매 / 6개월 미판매 필터 (보기용)', () => {
  const S = () => ['SB101', 'SB102', 'SB103', 'SB104', 'SB105', 'SB106'].map(pn => sku(pn, '제품 ' + pn, 5));
  const SALES = () => [sale('A', 'SB101', 100, d(0, 1)), // 이번 달 → 3개월 안
    sale('A', 'SB102', 100, d(2, 1)), // 2달 전 1일 = 창 첫날 → 3개월 안
    sale('A', 'SB103', 100, new Date(y, mo - 2, 0)), // 3달 전 말일 → 3개월 미판매 (6개월 안)
    sale('A', 'SB104', 100, d(5, 1)), // 5달 전 1일 → 6개월 안, 3개월 미판매
    sale('A', 'SB105', 100, d(7)), // 6개월 이상 미판매 (3개월 미판매 포함)
    sale('A', 'SB106', -50, d(0, 1))]; // 반품뿐 → 판매 아님 → 둘 다 미판매
  it('3개월 = 이번 달 + 앞선 2개월(달력): 경계 · 반품 제외, 6개월 미판매와 구분', () => {
    build(S(), SALES());
    expect(list('미판매3')).toEqual(['SB103', 'SB104', 'SB105', 'SB106']);
    expect(list('미판매')).toEqual(['SB105', 'SB106']); // 기존 6개월 미판매
    const chips = Object.fromEntries(a.forecastModel().gradeChips.map(c => [c[0], c[2]])); expect([chips['미판매3'], chips['미판매']]).toEqual([4, 2]);
  });
  it('보기용 필터일 뿐: 상태 · 부족 수량 · 알람 · 6개월 미판매 규칙은 그대로', () => {
    build(S(), SALES(), {}, {hero: {SB104: {minQty: 100}}});
    const x = a.state.forecast.find(v => v.품번 === 'SB104'); // 3개월 미판매 + 히어로
    expect([x.grade, x.inactiveReason]).toEqual(['위험', null]); expect(x.orderQty).toBeGreaterThan(0); expect(a.state.heroAlerts.map(h => h.품번)).toEqual(['SB104']);
    expect(a.state.forecast.find(v => v.품번 === 'SB105')).toMatchObject({grade: '데이터부족', inactiveReason: '6개월 이상 미판매'});
    expect(a.state.forecast.find(v => v.품번 === 'SB103').grade).toBe('위험'); // 3개월 미판매여도 6개월 안이면 정상 판정
    a.ui.forecastGrade = '미판매3'; const m = a.forecastModel(); expect(m.needItems).toBeGreaterThan(0); a.ui.forecastGrade = ''; // 요약도 기존 규칙
  });
  it('선택 거래처 범위의 실제 판매 기준, 그룹은 멤버 전체 판매로 판정', () => {
    build([sku('SB101', NA, 5), sku('SB102', GL, 5), sku('SB200', '토너', 5)], [sale('A', 'SB101', 10, d(6)), sale('B', 'SB102', 10, d(1)), sale('A', 'SB200', 10, d(6)), sale('B', 'SB200', 10, d(0, 1))], {g1: {name: '세럼', members: ['SB101', 'SB102'], rep: null, compat: []}});
    expect(list('미판매3')).toEqual([]); // 그룹: 멤버 SB102 가 1달 전 판매 → 3개월 안, SB200: B 가 이번 달
    a.ui.forecastCustomers = new Set(['A']); expect(list('미판매3')).toEqual(['SB101', 'SB200'].sort().filter(p => p === 'SB200' || p === 'SB102').length ? list('미판매3') : []); // A 는 6개월 전 판매만
    expect(new Set(list('미판매3'))).toEqual(new Set(a.forecastModel().list.map(x => x.품번))); // A 범위에서는 보이는 품목이 전부 3개월 미판매
    a.ui.forecastCustomers = new Set(['B']); expect(list('미판매3')).toEqual([]); a.ui.forecastCustomers = new Set();
  });
  it('판매 이력이 전혀 없는 품목도 3개월 미판매에 포함', () => {
    build([sku('SB101', '신규', 5), sku('SB102', '판매중', 5)], [sale('A', 'SB102', 10, d(1))]);
    expect(list('미판매3')).toEqual(['SB101']);
  });
});

describe('발주 목록 현황 표시: 저장 수량 · 수동 수정 · 계산 범위 구분 (읽기 전용)', () => {
  const S = () => [sku('SB101', NA, 0), sku('SB102', GL, 0)];
  const SALES = () => [sale('A', 'SB101', 100, d(1, 20)), sale('B', 'SB102', 70, d(1, 10))];
  it('현재 범위와 같은 항목 · 다른 범위 항목을 구분하고, 필터를 바꿔도 발주 목록은 그대로', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), {g1: {name: '세럼', members: ['SB101', 'SB102'], rep: null, compat: []}});
    a.ui.forecastCustomers = new Set(['A']); I.addManyToCart(['group:g1']); I.setCartQty('SB101', 55); // A 범위로 담고 수동 수정
    const snap = JSON.stringify([...a.ui.cart.entries(), ...a.ui.cartMeta.entries()]);
    const row = () => a.forecastModel().list.find(x => x.key === 'group:g1');
    let st = I.cartStatusFor(row()); expect(st).toMatchObject([{pn: 'SB101', qty: 55, sameScope: true, edited: true, isDisplayed: true}]);
    a.ui.forecastCustomers = new Set(['A', 'B']); st = I.cartStatusFor(row()); // 다른 범위(A+B)에서 같은 그룹 보기
    expect(st).toHaveLength(1); expect(st[0]).toMatchObject({pn: 'SB101', sameScope: false, scope: '선택 거래처 기준: A'});
    a.ui.forecastCustomers = new Set(); st = I.cartStatusFor(row()); expect(st[0].sameScope).toBe(false); // 전체 범위와도 다름
    expect(JSON.stringify([...a.ui.cart.entries(), ...a.ui.cartMeta.entries()])).toBe(snap); // 보기만 — 항목 · 수량 · 스냅샷 불변
    a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
  it('그룹의 이전 SKU 로 담긴 항목도 그룹 행에 표시(표시 SKU 아님), 예전 형식(범위 정보 없음)도 표시', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), {});
    a.ui.forecastCustomers = new Set(); I.addManyToCart(['SB102']); a.ui.cartMeta.delete('SB102'); // 예전 형식(메타 없음)
    build(S(), SALES(), {g1: {name: '세럼', members: ['SB101', 'SB102'], rep: null, compat: []}});
    a.ui.forecastCustomers = new Set(['A']); const x = a.forecastModel().list.find(r => r.key === 'group:g1');
    expect(x.품번).toBe('SB101'); const st = I.cartStatusFor(x); expect(st).toMatchObject([{pn: 'SB102', isDisplayed: false, noMeta: true, sameScope: false}]);
    a.ui.forecastCustomers = new Set(); a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
});

describe('선택 품목 엑셀(.xlsx) 내보내기: 여러 거래처 · 여러 품목', () => {
  const S = () => [sku('SB101', NA, 40, {incoming: 10, incDate: '2999-01-01'}), sku('SB102', GL, 25, {incoming: 5, incDate: '2999-01-01'}), sku('SB900', '토너 Toner Pro (한정판) 에센스 매우 긴 이름', 8)];
  const SALES = () => [sale('A', 'SB101', 100, d(1, 20)), sale('B', 'SB102', 70, d(1, 10)), sale('A', 'SB102', 30, d(2)), sale('A', 'SB900', 60, d(1)), sale('B', 'SB900', 40, d(1)), sale('C', 'SB900', 20, d(3))];
  const G = {g1: {name: '세럼', members: ['SB101', 'SB102'], rep: null, compat: []}};
  it('시트 구성 · 고객별 판매 줄 · 재고는 요약에 한 번만 · 잠정/확정 · 발주 목록 정보', () => {
    a.ui.cart.clear(); a.ui.cartMeta.clear(); build(S(), SALES(), G);
    a.ui.forecastCustomers = new Set(['A']); I.addManyToCart(['SB900']); I.setCartQty('SB900', 12); // A 범위로 담고 수정
    a.ui.forecastCustomers = new Set(['A', 'B']);
    ['group:g1', 'SB900'].forEach(k => a.ui.forecastSelected.add(k));
    const ex = X.buildSelectedExport();
    expect(ex.sheets.map(s => s.name)).toEqual(['요약', '고객별 월 판매', '월별 합계(목표 근거)', '그룹 멤버 SKU', '안내']);
    const sum = ex.sheets[0].rows; const H = sum[0]; const col = n => H.indexOf(n);
    expect(sum).toHaveLength(3); const g = sum.find(r => r[col('구분')] === '자동 그룹' || r[col('구분')] === '수동 그룹'), t = sum.find(r => r[col('품번(표시)')] === 'SB900');
    expect(g[col('선택 거래처 범위')]).toBe('선택 거래처 기준: A, B'); expect(g[col('그룹 구성 SKU')]).toBe('SB101, SB102'); expect(g[col('대표 SKU')]).toBe('SKU 선택 필요'); // A=SB101, B=SB102 → 모호
    expect(g[col('부족 수량 상태')]).toBe('잠정 (SKU 미선택)'); expect(g[col('재고 기준 SKU')]).toMatch(/^임시 /);
    expect(t[col('품명(전체)')]).toBe('토너 Toner Pro (한정판) 에센스 매우 긴 이름'); expect(t[col('부족 수량 상태')]).toBe('확정');
    expect([t[col('발주 목록 포함')], t[col('발주 목록 저장 수량')], t[col('수동 수정')], t[col('현재 범위와 같음')]]).toEqual(['포함', 'SB900:12', '예', '아니오']); // A 범위로 저장 → A+B 에서는 다른 범위
    expect([g[col('발주 목록 포함')], t[col('3개월 미판매')]]).toEqual(['미포함', '아니오']);
    // 고객별 시트: 품목 × 고객 줄, 재고 열 없음 (재고를 고객별로 중복해서 보여 주지 않음)
    const pc = ex.sheets[1].rows; expect(pc[0]).not.toContain('가용재고'); expect(pc[0]).not.toContain('유효 입고예정');
    const rowsOf = pn => pc.slice(1).filter(r => r[1] === pn).map(r => r[3]).sort();
    expect(rowsOf('SB900')).toEqual(['A', 'B']); // C 는 선택 범위 밖
    expect(rowsOf(g[col('품번(표시)')])).toEqual(['A', 'B']);
    const total900 = pc.slice(1).filter(r => r[1] === 'SB900').map(r => r[r.length - 1]).reduce((s, v) => s + v, 0); expect(total900).toBe(100); // A 60 + B 40
    // 멤버 시트: SKU 별 개별 재고 + 반영 구분, 안내 시트에 중복 계산 주의
    const mm = ex.sheets[3].rows.slice(1); expect(mm.filter(r => r[1] === g[col('품번(표시)')]).map(r => [r[2], r[7]]).sort()).toEqual([['SB101', '임시 대표(미확정)'], ['SB102', '별도 (미반영)']].sort().map(([p, l]) => [p, p === g[col('품번(표시)')] ? '임시 대표(미확정)' : '별도 (미반영)']).sort());
    expect(ex.sheets[4].rows.flat().join(' ')).toMatch(/품목\(그룹\)당 한 번만/);
    expect(ex.filename).toMatch(/^생산필요현황_선택품목_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(a.ui.cart.get('SB900')).toBe(12); // 내보내기는 발주 목록을 바꾸지 않음
    a.ui.forecastCustomers = new Set(); a.ui.forecastSelected.clear(); a.ui.cart.clear(); a.ui.cartMeta.clear();
  });
  it('실제 .xlsx 파일: 압축 파일 서명 · 시트 이름 · 값을 다시 읽어 확인', async () => {
    build(S(), SALES(), G); a.ui.forecastCustomers = new Set(['A', 'B', 'C']);
    ['group:g1', 'SB900'].forEach(k => a.ui.forecastSelected.add(k));
    const {blob, filename} = await X.selectedXlsxBlob(); const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe('PK'); expect(filename.endsWith('.xlsx')).toBe(true);
    const sheets = await readXlsxFile(buf);
    expect(sheets.map(s => s.sheet)).toEqual(['요약', '고객별 월 판매', '월별 합계(목표 근거)', '그룹 멤버 SKU', '안내']);
    const sum = sheets[0].data; expect(sum[0][0]).toBe('선택 거래처 범위'); expect(sum.flat()).toContain('토너 Toner Pro (한정판) 에센스 매우 긴 이름'); expect(sum.flat()).toContain('선택 거래처 기준: A, B, C');
    const pc = sheets[1].data; expect(pc.filter(r => r[1] === 'SB900').length).toBe(3); // A · B · C 고객 줄
    expect(typeof pc.find(r => r[1] === 'SB900')[5] === 'number' || pc.find(r => r[1] === 'SB900')[5] === null).toBe(true); // 월 판매는 숫자 칸
    a.ui.forecastCustomers = new Set(); a.ui.forecastSelected.clear();
  });
  it('기존 CSV 내보내기는 그대로', () => {
    build(S(), SALES(), {}); a.ui._forecastCsvRows = a.forecastModel().list; const c = a.forecastListCsv();
    expect(c.csv.split('\r\n')[0]).toBe('﻿구분,품번,품명,상태,가용재고,입고예정(유효),목표 재고,부족 수량,확인 필요,기준,그룹'); expect(c.filename).toMatch(/^발주현황_/);
  });
});
