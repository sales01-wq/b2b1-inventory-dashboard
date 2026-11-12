// 실제 ERP 파일 비교 (선택, 평소에는 건너뜀): 같은 파일(CSV · 여러 시트 엑셀)을 운영 index.html 과 새 앱 코드에 올려서
// 시트 인식 · 읽은 데이터 · 팀별 발주 현황 · 판매 피벗 · 품목별 판매 · 조회(모든 품목 추천 선택) · LOT · PLT · CSV 가 모두 같은지 비교합니다.
//   ERP_DIR=파일이 든 폴더  XLSX_LIB=xlsx.full.min.js 경로(엑셀이 있을 때)  npx vitest run src/lib/realdata.test.js
// 파일 내용은 이 컴퓨터 안에서만 읽고, 결과에는 다른 점만 나옵니다. 파일을 저장소에 넣지 마세요.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import Papa from 'papaparse';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {NOW, loadOracle, loadPort, canon} from './__fixtures__/harness.js';

const DIR = process.env.ERP_DIR;
const XLSX_LIB = process.env.XLSX_LIB;
const TEAMS = ['B2B1팀', 'B2B2팀', '전체'];

async function scenario({api: a, calcExportPlt, csv}, W) {
  const out = {};
  const rec = (k, v) => { out[k] = canon(v); };
  const names = fs.readdirSync(DIR).filter(n => /\.(csv|xlsx|xls)$/i.test(n)).sort();
  const files = names.map(n => new W.File([fs.readFileSync(path.join(DIR, n))], n));
  a.unresolvedFiles.length = 0;
  await a.handleFiles(files);
  rec('detected', a.unresolvedFiles.map(f => [f.fileName, f.key, f.rows ? f.rows.length : null, f.errorMsg || null]));
  rec('rows', a.unresolvedFiles.map(f => f.rows)); // 엑셀 · CSV 에서 읽은 값 그대로 (빠지거나 바뀐 칸이 없는지)
  a.applyUploadedData('upload');
  rec('applied', {error: a.state.error, loaded: a.state.loaded, inventory: a.state.inventory, schedule: a.state.schedule, salesByTeam: a.state.salesByTeam, expiry: a.state.expiry, master: a.state.productMaster});

  for (const team of TEAMS) {
    a.ui.team = team; a.state.sales = a.salesForTeam(); a.computeDerived();
    const pns = a.productList().map(p => p.품번 || p);
    rec('derived:' + team, {
      forecast: a.state.forecast, heroAlerts: a.state.heroAlerts, customers: a.state.customers, quarters: a.state.quarters,
      invByProduct: a.state.invByProduct, custQuarterProduct: a.state.custQuarterProduct, productList: a.productList(),
      scoped: a.state.forecast.map(x => ['all', 'b2b1', 'emp'].map(s => a.scopedAvailable(x.품번, s))),
      pivot: a.buildPivotRows(), custShort: a.custShortSummaryCached(), sku: a.buildSkuStatusData(pns.slice(0, 40)),
    });
    a.ui._forecastCsvRows = a.state.forecast;
    rec('csv:forecastList:' + team, csv('downloadForecastListCsv'));
    pns.slice(0, 40).forEach(p => a.ui.skuStatusSelected.add(p));
    rec('csv:sku:' + team, csv('downloadSkuStatusCsv'));
    a.ui.skuStatusSelected.clear();
  }
  a.ui.team = 'B2B1팀'; a.state.sales = a.salesForTeam(); a.computeDerived();

  // 조회: 제품일정표의 모든 품번 (필요 수량 = 발주 현황의 발주할 수량) → 대체품목 포함 전체 추천 선택 → LOT · 다운로드 목록 · PLT · CSV
  const order = new Map(a.state.forecast.map(x => [x.품번, x.orderQty]));
  const all = [...new Set(a.state.schedule.map(r => r.품번))];
  a.doLookupBatch(all.map(pn => (order.get(pn) > 0 ? `${pn} ${order.get(pn)}` : pn)).join('\n'), '', '');
  rec('lookup', a.ui.lookupItems.map(i => [i.status, i.row && i.row.품번, (i.alternatives || []).map(x => x.품번)]));
  rec('lots', all.map(pn => a.pickRecommendedLot(pn)));
  a.ui.autoSelectIncludeAlternatives = true;
  a.ui.lookupItems.forEach(a.applyAutoSelectForItem);
  rec('exportRows', a.buildExportRows());
  for (const [k, inputs] of [['separate', {L: '110', W: '110', H: '150', baseHeight: '15', tare: '20', mixMode: 'X'}], ['mixed', {L: '110', W: '110', H: '150', baseHeight: '15', tare: '20', mixMode: 'O'}]]) {
    calcExportPlt(inputs);
    rec('plt:' + k, [a.ui.exportPltByProduct, a.ui.exportPltDetail, a.ui.exportPltPacking, a.ui.exportPltMixedTotal, a.ui.exportPltNumbersByProduct, a.ui.exportPltRepWeightByProduct, a.ui.exportPltRepDimsByProduct]);
    rec('csv:export:' + k, csv('downloadExportCsv'));
  }
  return out;
}

describe.skipIf(!DIR)('실제 ERP 파일: 운영 index.html = 새 앱', () => {
  afterAll(() => vi.useRealTimers());
  it('모든 단계가 같음', async () => {
    const lib = XLSX_LIB ? fs.readFileSync(XLSX_LIB, 'utf8') : null;
    const o = loadOracle();
    if (lib) o.w.eval(lib); // 운영 페이지는 CDN <script> 로 불러오는 라이브러리
    const exp = await scenario(o, o.w);
    o.close();

    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
    const p = await loadPort();
    const W = new JSDOM('').window;
    globalThis.FileReader = W.FileReader; globalThis.Papa = Papa;
    if (XLSX_LIB) globalThis.XLSX = createRequire(import.meta.url)(path.resolve(XLSX_LIB));
    const act = await scenario(p, W);

    console.log('비교한 파일 · 시트:', exp.detected.map(([n, k, rows, err]) => `${n} → ${k || (err ? '오류: ' + err : '인식 안 됨')} (${rows ?? '-'}행)`).join('\n  '));
    expect(exp.applied.loaded).toBe(true); // 실제로 데이터가 들어갔는지 (빈 결과끼리 비교 방지)
    for (const k of Object.keys(exp)) expect(act[k], k).toEqual(exp[k]);
    expect(Object.keys(act).sort()).toEqual(Object.keys(exp).sort());
  }, 300000);
});
