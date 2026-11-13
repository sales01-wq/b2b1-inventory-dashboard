// 비교 테스트: 운영 중인 index.html 의 계산 결과(정답)와 src/lib 로 옮긴 계산 결과가 완전히 같은지 확인합니다.
// 운영 페이지를 jsdom 안에서 그대로 실행하고, 같은 시트 · 같은 기준일로 같은 순서의 작업을 양쪽에 수행합니다.
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadOracle, loadPort, canon} from './__fixtures__/harness.js';

/** 양쪽에 똑같이 수행하는 업무 시나리오. 단계별 결과를 모아 반환합니다. */
function scenario({api: a, calcExportPlt, csv}) {
  const out = {};
  const sh = makeSheets(NOW);
  const rec = (k, v) => { out[k] = canon(v); };

  // 1) 시트 읽기
  rec('detect', [sh.inventory, sh.schedule, sh.sales1, sh.sales2, sh.expiry, sh.productMaster, [['아무', '시트']]].map(a.detectSheetType));
  rec('teams', [a.teamFromName('판매실적_B2B2팀.xlsx'), a.teamFromName('판매.xlsx'), a.teamFromRows(sh.sales1), a.teamFromRows(sh.sales2), a.teamFromRows(sh.inventory)]);
  rec('dates', ['2026-03-05', '2026.3.5', '2026/03/05 13:00', '03-05-2026', '13-05-2026', 'Mar 5 2026', '', null, 'abc'].map(a.parseDateStr));
  rec('nums', ['1,234', ' 5 ', '', null, 'x', '-3.5', 0].map(a.num));
  rec('monthCols', [a.findMonthColumns(['1월 입고일정', '1월 입고수량', '2월 입고일정', '3월 입고일정', '3월 입고수량', '4월 입고일정']), a.findHeaderRow([[], [], [], [], [], [], [], [], [], [], [], [], ['창고', '품번', '품명', '바코드']], ['창고', '품번', '품명', '바코드'])]);
  const loadAll = () => {
    a.state.inventory = a.parseInventory(sh.inventory);
    a.state.schedule = a.parseSchedule(sh.schedule);
    a.state.scheduleMonthLabels = a.state.schedule.monthLabels;
    a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)};
    a.state.sales = a.salesForTeam();
    a.state.expiry = a.parseExpiry(sh.expiry);
    a.state.productMaster = a.parseProductMaster(sh.productMaster);
    a.computeDerived();
  };
  loadAll();
  rec('parsed', {inventory: a.state.inventory, schedule: a.state.schedule, sales: a.state.sales, expiry: a.state.expiry, master: a.state.productMaster});

  // 2) 팀 · 등급 기준 · 히어로 설정별 발주 현황
  const derived = tag => {
    rec('derived:' + tag, {
      forecast: a.state.forecast, heroAlerts: a.state.heroAlerts, heroMissing: a.state.heroMissing,
      customers: a.state.customers, quarters: a.state.quarters, custQuarterProduct: a.state.custQuarterProduct,
      invByProduct: a.state.invByProduct, salesByProduct: a.state.salesByProduct,
      productList: a.productList(), months: a.getAllSalesMonths(),
      scoped: [...a.state.forecast].sort((p, q) => (p.품번 < q.품번 ? -1 : 1)).map(x => ['all', 'b2b1', 'emp'].map(s => a.scopedAvailable(x.품번, s))),
      salesDetail: a.salesDetailFor('SB001'),
      sku: a.buildSkuStatusData(['SB001', 'MC002']), skuLabel: ['2026-01', '2025-12'].map(m => [a.skuMonthLabel(m, true), a.skuMonthLabel(m, false)]),
      teamLabel: a.teamLabel(),
    });
  };
  for (const team of ['B2B1팀', 'B2B2팀', '전체']) {
    a.ui.team = team;
    loadAll();
    derived(team);
  }
  a.ui.team = 'B2B1팀';
  a.settings.rules = {riskPct: 30};
  a.settings.hero = {MT002: {minQty: 200, warnQty: 400}, SB002: {minQty: 5}, NOPE1: {minQty: 1}};
  loadAll();
  derived('custom-rules-hero');
  a.settings.rules = {}; a.settings.hero = {};
  loadAll();

  // 3) 판매 현황 피벗 (거래처 0 / 1 / 2개 선택, 브랜드 · 품번 필터)
  const pivot = (cust, pns, brands) => {
    a.ui.custSelected.clear(); cust.forEach(c => a.ui.custSelected.add(c));
    a.ui.pnSelected.clear(); pns.forEach(p => a.ui.pnSelected.add(p));
    a.ui.brandSelected.clear(); brands.forEach(b => a.ui.brandSelected.add(b));
    return a.buildPivotRows();
  };
  rec('pivot', [pivot([], [], []), pivot(['A상사'], [], []), pivot(['A상사', 'B유통'], [], []), pivot([], ['SB001', 'MC002'], []), pivot([], [], ['마미케어'])]);
  a.ui.brandSelected.clear(); a.ui.custSelected.clear(); a.ui.pnSelected.clear();

  // 4) 바코드 · 품명 조회
  rec('resolve', [
    a.resolveBarcode('8800000000097'), a.resolveBarcode('8800000000097-1'), a.resolveBarcode('sb004'), a.resolveBarcode('8800000000097', 'b유통'),
    a.resolveBarcode('8800000000097', '없는거래처'), a.resolveBarcode('0000'), a.resolveBarcode('8800000000080'),
    a.resolveNameMatches('세트', ''), a.resolveNameMatches('세트', 'b유통'), a.alternativesFor(a.state.schedule[9]),
  ]);
  a.doLookupBatch('8800000000011\t1,500\n8800000000097 30\nMT002, MC002 5\nUNKNOWN\n8800000000011', '세트, 크림\n없는품명', '');
  rec('lookupItems', [a.ui.lookupItems, a.ui.neededQty]);

  // 5) 출고 목록: 추천 자동 선택, 직접 선택, 필요 수량 배분, LOT 추천
  a.ui.autoSelectIncludeAlternatives = true;
  a.ui.lookupItems.forEach(a.applyAutoSelectForItem);
  a.addToExport('SB001', '성분 에디터 세럼', '8800000000011', 'A상사', 'EMP 물류', 300);
  a.addToExport('SB001', '성분 에디터 세럼', '8800000000011', 'A상사', 'EMP 물류', 300); // 중복 무시
  a.toggleIncoming('SB005', '세트 A 리뉴얼', '8800000000097-1', 'B유통', '12월', a.state.schedule[10].aug_d, 100);
  a.toggleIncoming('MT003', '스케줄만', '8800000000103', 'C마트', '12월', '', 50);
  a.toggleExpiry('SB001', '성분 에디터 세럼', '8800000000011', 'A상사', 'L-SHORT', a.state.expiry[2].유통기한Str, 1500);
  a.ui.neededQty.set('SB006', 100);
  rec('lots', ['SB001', 'MT002', 'SB006', 'MC001'].flatMap(pn => [0, 500, 1000, 1600, 99999].map(n => { a.ui.neededQty.set(pn, n); return a.pickRecommendedLot(pn); })));
  a.ui.neededQty.set('SB001', 1500); a.ui.neededQty.set('MT002', 60); a.ui.neededQty.set('SB006', 100); a.ui.neededQty.delete('MC001');
  a.ui.manualBoxInfo.set('SB006', {아웃입수: 20, 아웃H: 350});
  rec('selection', [a.ui.exportList, a.ui.incomingList, a.ui.expiryList, ['SB001', 'SB005', 'MT003', 'XX'].map(a.selectionSummaryFor),
    ['SB001', 'MT002'].map(a.productNeedDiff), ['SB005', 'MT003'].map(pn => [a.incomingDateText(pn), a.incomingQtyText(pn)]),
    ['SB001'].map(pn => [a.expiryLotText(pn), a.expiryDateText(pn), a.expiryQtyText(pn)]), ['SB001', 'SB006', 'NONE'].map(a.masterFieldsFor),
    a.buildExportRows()]);

  // 6) PLT 계산: 직접 호출 + 개별 / 혼적 모드 + 입력칸이 비었을 때의 기본값
  rec('pltRow', [
    a.computePltForRow('SB001', 1000, 110, 110, 135), a.computePltForRow('8800000000059', 61, 120, 100, 150),
    a.computePltForRow('SB006', 7, 110, 110, 50), a.computePltForRow('MC001', 5, 110, 110, 150), a.computePltForRow('없음', 5, 110, 110, 150),
  ]);
  rec('pack', [
    a.packPalletsMixed([{pn: 'A', 품명: 'a', frac: 2.6, boxesPerPallet: 40, weightPerBoxKg: 9.5, perLayer: 8, boxH: 25}, {pn: 'B', 품명: 'b', frac: 0.5, boxesPerPallet: 30, weightPerBoxKg: 7, perLayer: 6, boxH: 33}, {pn: 'C', 품명: 'c', frac: 0.45, boxesPerPallet: 10, weightPerBoxKg: 12, perLayer: 2, boxH: 70}, {pn: 'D', 품명: 'd', frac: 1, boxesPerPallet: 0, weightPerBoxKg: 0, perLayer: 0, boxH: 0}], 20, 110, 110),
    a.packPalletsMixed([], 0, 100, 100),
  ]);
  const pltState = () => [a.ui.exportPltByProduct, a.ui.exportPltDetail, a.ui.exportPltPacking, a.ui.exportPltMixedTotal,
    a.ui.exportPltNumbersByProduct, a.ui.exportPltRepWeightByProduct, a.ui.exportPltRepDimsByProduct, a.ui.pltMixMode, a.ui.exportPltTareKg, a.ui.exportPltBaseHeightCm];
  calcExportPlt({L: '110', W: '110', H: '150', baseHeight: '15', tare: '20', mixMode: 'X'});
  rec('plt:separate', pltState());
  rec('csv:export-separate', csv('downloadExportCsv'));
  calcExportPlt({L: '120', W: '100', H: '1600', baseHeight: '', tare: '25', mixMode: 'O'});
  rec('plt:mixed', pltState());
  rec('csv:export-mixed', csv('downloadExportCsv'));
  calcExportPlt({L: '', W: '0', H: '', baseHeight: '', tare: '', mixMode: 'X'}); // 숫자 입력칸이라 빈 값 · 0 만 가능
  rec('plt:defaults', pltState());

  // 7) 나머지 CSV
  ['SB001', 'MC002'].forEach(p => a.ui.skuStatusSelected.add(p));
  rec('csv:sku', csv('downloadSkuStatusCsv'));

  // 8) 목록에서 빼기
  a.removeFromExport(a.ui.exportList[0].key);
  a.removeIncoming(a.ui.incomingList[0].key);
  a.removeExpiry(a.ui.expiryList[0].key);
  a.toggleIncoming('MT003', '스케줄만', '8800000000103', 'C마트', '12월', '', 50); // 다시 누르면 빠짐
  rec('removed', [a.ui.exportList, a.ui.incomingList, a.ui.expiryList]);
  return out;
}

describe('src/lib 계산 결과 = 운영 index.html 계산 결과', () => {
  let expected, actual;
  beforeAll(async () => {
    const oracle = loadOracle();
    expected = scenario(oracle);
    oracle.close();
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(NOW);
    actual = scenario(await loadPort());
  });
  afterAll(() => vi.useRealTimers());

  it('시나리오가 실제 데이터를 만들어냄 (빈 결과끼리 비교하는 것 방지)', () => {
    expect(expected['derived:B2B1팀'].forecast.length).toBeGreaterThan(8);
    expect(expected['csv:export-mixed'].csv).toContain('PLT 구성 상세');
    expect(expected['lookupItems'][0].length).toBeGreaterThan(5);
  });

  const steps = ['detect', 'teams', 'dates', 'nums', 'monthCols', 'parsed', 'derived:B2B1팀', 'derived:B2B2팀', 'derived:전체', 'derived:custom-rules-hero',
    'pivot', 'resolve', 'lookupItems', 'lots', 'selection', 'pltRow', 'pack',
    'plt:separate', 'csv:export-separate', 'plt:mixed', 'csv:export-mixed', 'plt:defaults', 'csv:sku', 'removed'];
  it.each(steps)('%s', step => {
    expect(actual[step]).toEqual(expected[step]);
  });
  it('시나리오의 모든 단계를 비교함', () => {
    expect(Object.keys(expected).sort()).toEqual([...steps].sort());
  });
});
