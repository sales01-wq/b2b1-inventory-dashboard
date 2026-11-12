// 수동 업로드 전체 흐름 시험 (가짜 Drive · Apps Script, 테스트 데이터만):
//   ERP 에서 내려받은 엑셀(실제 파일 이름 모양) → pack(검사 · 이름 정리 · zip) → Apps Script 묶음 처리(전부 아니면 전무) → 검사를 거친 저장본(JSON)
//   → 대시보드가 저장본을 받아 계산한 결과 = 같은 데이터를 직접 올렸을 때의 결과. 잘못된 업로드는 저장본을 바꾸지 못함.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadPort, canon} from './__fixtures__/harness.js';

const hasCollector = fs.existsSync(new URL('../../../collector/node_modules/read-excel-file', import.meta.url));
const sh = makeSheets(NOW);
const REAL_NAMES = {inventory: '가용재고조회_olive_20261013', wms: 'WMS창고재고관리(EMP)_olive_20261013', sales1: '일자별판매실적분석_20261013_B2B1', sales2: '일자별판매실적분석_20261013_B2B2', schedule: '제품일정표_olive_20261013'}; // 옛 이름(팀 없음)도 섞음
const ROWS = {inventory: sh.inventory, wms: sh.expiry, sales1: sh.sales1, sales2: sh.sales2, schedule: sh.schedule};

/** 저장본(JSON) 또는 직접 올린 시트 → 대시보드 계산 결과 */
async function dashboard(tabs) {
  const p = await loadPort(), a = p.api;
  a.unresolvedFiles.length = 0;
  Object.entries(tabs).forEach(([name, rows]) => a.unresolvedFiles.push({fileName: `구글시트 — ${name}`, rows, key: a.detectSheetType(rows)})); // shared.js applySharedData 와 같은 방식
  const r = a.applyUploadedData('googlesheet');
  expect(r.error).toBeUndefined();
  const out = {};
  for (const team of ['B2B1팀', 'B2B2팀', '전체']) { a.ui.team = team; a.state.sales = a.salesForTeam(); a.computeDerived(); out[team] = canon({forecast: a.state.forecast, customers: a.state.customers, pivot: a.buildPivotRows(), expiry: a.state.expiry, master: a.state.productMaster, inv: a.state.invByProduct}); }
  return out;
}

describe.skipIf(!hasCollector)('수동 업로드 → Drive → Apps Script → 저장본 → 대시보드', () => {
  afterAll(() => vi.useRealTimers());
  it('결과가 직접 올린 것과 같고, 잘못된 업로드는 마지막 정상 저장본을 바꾸지 못함', async () => {
    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW);
    const {writeXlsx} = await import('../../../collector/src/xlsx.js');
    const {packFolder} = await import('../../../collector/src/pack.js');
    const {world} = await import('../../../collector/test/gas-fake.js');

    // 1) 내려받은 폴더: 엑셀 5개 + 상품마스터(이 도구가 다루지 않음)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
    for (const [id, base] of Object.entries(REAL_NAMES)) fs.writeFileSync(path.join(dir, base + '.xlsx'), await writeXlsx(ROWS[id]));
    fs.writeFileSync(path.join(dir, '상품마스터_전체_2026-10-13.xlsx'), await writeXlsx(sh.productMaster));
    const packed = await packFolder({dir, out: path.join(dir, 'out'), now: new Date(NOW)});
    expect(packed.ok, packed.errors.join(' | ')).toBe(true);

    // 2) Drive 업로드 폴더에 묶음 1개 → Apps Script (기존 상품마스터 탭은 이미 시트에 있음)
    const w = world();
    w.mkSheet('상품마스터_전체', sh.productMaster); w.mkSheet('__설정', [['kind']]);
    const master = JSON.stringify(w.tabs.get('상품마스터_전체').data);
    await w.addBundle(packed.bundle, fs.readFileSync(path.join(packed.out, packed.bundle)));
    expect(w.run()).toBe(1);
    expect(JSON.stringify(w.tabs.get('상품마스터_전체').data)).toBe(master); // 상품마스터 보존
    expect(w.snapshot()).toBe(true);
    const snap1 = w.snapshotJson(), id1 = w.props.SNAPSHOT_FILE_ID;
    expect(Object.keys(snap1).sort()).toEqual(['WMS창고재고관리(EMP)_olive', '가용재고조회_olive', '상품마스터_전체', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표_olive']);

    // 3) 대시보드: 저장본으로 계산한 결과 = 같은 데이터를 직접 올린 결과 (모든 팀)
    const direct = await dashboard({'가용재고조회_olive': sh.inventory, 'WMS창고재고관리(EMP)_olive': sh.expiry, '일자별판매실적분석_B2B1팀': sh.sales1, '일자별판매실적분석_B2B2팀': sh.sales2, '제품일정표_olive': sh.schedule, '상품마스터_전체': sh.productMaster});
    const viaPipeline = await dashboard(snap1);
    expect(Object.keys(viaPipeline['B2B1팀'].forecast).length).toBeGreaterThan(5);
    expect(viaPipeline).toEqual(direct);

    // 4) 잘못된 업로드(WMS 자리에 가용재고 내용): 묶음 거부, 시트 · 저장본 그대로
    const bad = await packFolder({dir: (() => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-')); for (const [id, base] of Object.entries(REAL_NAMES)) fs.writeFileSync(path.join(d, base + '.xlsx'), fs.readFileSync(path.join(dir, REAL_NAMES[id === 'wms' ? 'inventory' : id] + '.xlsx'))); return d; })(), out: path.join(dir, 'bad'), now: new Date(NOW)});
    expect(bad.ok).toBe(false); expect(bad.errors.join(' ')).toMatch(/wms: 시트 종류가 inventory/); // pack 이 먼저 막음
    // pack 을 거치지 않고 직접 올려도 (잘못된 zip) Apps Script 가 막음
    const {zipSync} = await import('../../../collector/test/gas-fake.js');
    const sheetsBefore = JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));
    const wrong = {}; for (const [id, base] of Object.entries(REAL_NAMES)) wrong[`${base}.xlsx`] = new Uint8Array(await writeXlsx(ROWS[id === 'wms' ? 'inventory' : id]));
    await w.addBundle('ERP_BUNDLE_bad.zip', Buffer.from(zipSync(wrong)));
    expect(w.run()).toBe(0);
    expect(JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]))).toBe(sheetsBefore);
    expect(w.props.SNAPSHOT_FILE_ID).toBe(id1);
    expect(w.problems().bundle.msg).toMatch(/시트 종류가 맞지 않음/);
    expect(await dashboard(w.snapshotJson())).toEqual(direct); // 대시보드는 여전히 마지막 정상 데이터
  }, 120000);
});
