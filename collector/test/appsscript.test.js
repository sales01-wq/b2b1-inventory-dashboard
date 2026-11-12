// 업로드 폴더 한 묶음 처리(Batch.gs)를 가짜 Drive · 시트 객체 위에서 실행: 엑셀 5개를 하나씩 올리는 기존 방식과 선택적 zip 모두에서
// "전부 아니면 전무", 상품마스터 보존, 문제 파일이 있어도 시트 · 파일을 건드리지 않음을 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import mock from '../src/adapters/mock.js';
import {FILES, fileName} from '../src/files.js';
import {world} from './gas-fake.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const bufsP = mock().fetchAll(FILES, NOW);
const NAMES = Object.fromEntries(FILES.map(d => [d.id, fileName(d, NOW)]));
const snap = w => JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));
async function upload(w, over = {}) { // 5개 엑셀을 폴더에 (over: id → Buffer | null)
  const b = await bufsP;
  for (const d of FILES) { const buf = d.id in over ? over[d.id] : b.get(d.id); if (buf) await w.addExcel(NAMES[d.id], buf); }
}
const withMaster = w => { w.mkSheet('상품마스터_전체', [['상품코드', '아웃무게g'], ['SB001', 100]]); w.mkSheet('__설정', [['kind']]); return w; };
const names = w => w.source.files.map(f => f.name).sort();

test('기존 방식: 엑셀 5개를 올리면 기존 탭 이름으로 전부 교체, 상품마스터 그대로, 파일은 전부 처리완료로', async () => {
  const w = withMaster(world());
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('유통기한_옛이름', [['그대로 남음']]);
  const master = JSON.stringify(w.tabs.get('상품마스터_전체').data);
  await upload(w);
  assert.equal(w.run(), 5);
  assert.deepEqual([...w.tabs.keys()].filter(n => !n.startsWith('__')).sort(), ['WMS창고재고관리(EMP)_olive', '가용재고조회_olive', '상품마스터_전체', '유통기한_옛이름', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표_olive']);
  assert.notEqual(w.tabs.get('가용재고조회_olive').data[0][0], '옛 데이터');
  assert.equal(JSON.stringify(w.tabs.get('상품마스터_전체').data), master);
  assert.deepEqual([w.source.files.length, w.processed.files.length], [0, 5]);
  assert.equal(JSON.parse(w.props.LAST_UPDATE).files, 5); assert.equal(JSON.parse(w.props.LAST_UPDATE).by, '자동(폴더 감시)');
  assert.equal(w.problems(), null); assert.ok(w.temps.size === 5 && w.trashed.length === 5);
});

test('5개 중 하나가 잘못되면(내용 종류가 이름과 다름) 4개도 반영하지 않고 시트 · 파일 그대로, 문제 기록 → 고쳐 올리면 반영', async () => {
  const w = withMaster(world()); w.mkSheet('가용재고조회_olive', [['옛 데이터']]);
  const b = await bufsP, before = snap(w);
  await upload(w, {wms: b.get('inventory')}); // WMS 파일 자리에 가용재고 내용
  assert.equal(w.run(), 0);
  assert.equal(snap(w), before); assert.equal(w.processed.files.length, 0); assert.equal(w.source.files.length, 5);
  assert.match(w.problems().bundle.msg, /WMS창고재고관리\(EMP\)_olive_20261112\.xlsx: 시트 종류가 이름과 맞지 않음.*expiry.*inventory.*하나도 바꾸지 않았습니다/);
  w.source.files.splice(w.source.files.findIndex(f => f.name.startsWith('WMS')), 1); // 잘못된 파일을 지우고
  await w.addExcel(NAMES.wms, b.get('wms'));                                        // 올바른 파일을 올림
  assert.equal(w.run(), 5); assert.equal(w.problems(), null); assert.equal(w.processed.files.length, 5);
});

test('읽을 수 없는 파일 · 데이터 없는 파일 · 같은 탭을 만드는 파일 둘 · 알 수 없는 내용은 묶음 전체를 막음', async () => {
  const b = await bufsP;
  for (const [label, mutate, msg] of [
    ['엑셀이 아닌 내용', {schedule: Buffer.from('garbage')}, /제품일정표_olive_20261112\.xlsx/],
    ['머리글만 있는 파일', {inventory: Buffer.from(await (await import('../src/xlsx.js')).writeXlsx([['창고', '품번', '품명', '바코드']]))}, /데이터가 없음/],
  ]) {
    const w = withMaster(world()); w.mkSheet('제품일정표_olive', [['옛 일정']]); const before = snap(w);
    await upload(w, mutate);
    assert.equal(w.run(), 0, label); assert.equal(snap(w), before, label); assert.equal(w.source.files.length, 5, label);
    assert.match(w.problems().bundle.msg, msg, label);
  }
  const w = withMaster(world()); const before = snap(w);
  await upload(w); await w.addExcel('가용재고조회_olive_20261013.xlsx', b.get('inventory')); // 같은 탭(가용재고조회_olive)을 만드는 파일이 둘
  assert.equal(w.run(), 0); assert.equal(snap(w), before); assert.match(w.problems().bundle.msg, /같은 탭\(가용재고조회_olive\)을 만드는 파일이 둘/);
});

test('쓰기 중간에 실패해도 기존 시트 그대로 (임시 탭 정리), 파일도 그대로', async () => {
  const w = withMaster(world({failWriteOn: '__new_일자별판매실적분석_B2B2팀'}));
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('제품일정표_olive', [['옛 일정']]); const before = snap(w);
  await upload(w);
  assert.equal(w.run(), 0); assert.equal(snap(w), before);
  assert.ok(![...w.tabs.keys()].some(n => n.startsWith('__new_') || n.startsWith('__old_')));
  assert.equal(w.source.files.length, 5); assert.match(w.problems().bundle.msg, /시트 쓰기/);
});

test('바뀐 파일만 올리기(기존 방식): 가용재고 하나만 올리면 그 탭만 바뀜 · 상품마스터 파일 올리기도 동작 · 잘못된 마스터는 막힘', async () => {
  const w = withMaster(world()); const b = await bufsP;
  await upload(w); w.run(); const sales = JSON.stringify(w.tabs.get('일자별판매실적분석_B2B1팀').data);
  await w.addExcel(NAMES.inventory, b.get('inventory'));
  assert.equal(w.run(), 1); assert.equal(JSON.stringify(w.tabs.get('일자별판매실적분석_B2B1팀').data), sales);
  const { writeXlsx } = await import('../src/xlsx.js');
  const master = [['상품코드', '아웃무게g', '인무게g', '제품무게g'], ['SB001', '100', '10', '5']];
  await w.addExcel('상품마스터_전체_2026-11-12.xlsx', await writeXlsx(master));
  assert.equal(w.run(), 1); assert.equal(w.tabs.get('상품마스터_전체').data[1][0], 'SB001');
  const keep = snap(w);
  await w.addExcel('상품마스터_전체_2026-11-13.xlsx', await writeXlsx([['아무', '내용'], ['x', 'y']]));
  assert.equal(w.run(), 0); assert.equal(snap(w), keep); assert.match(w.problems().bundle.msg, /시트 종류를 알 수 없음/);
});

test('이름이 낯선 파일(예: 옛 유통기한)은 내용이 알려진 종류면 기존처럼 처리, 아니면 막음. 여러 시트가 든 엑셀은 파일이름__시트이름', async () => {
  const w = withMaster(world()); const b = await bufsP;
  await w.addExcel('유통기한_20261013.xlsx', b.get('wms'));
  assert.equal(w.run(), 1); assert.ok(w.tabs.get('유통기한'));
  await w.addExcel('메모_20261013.xlsx', b.get('wms')); // 낯선 이름이지만 내용은 expiry → 허용 (기존 동작)
  assert.equal(w.run(), 1); assert.ok(w.tabs.get('메모'));
});

test('zip 은 선택: 같은 폴더의 엑셀과 zip 이 한 묶음으로 처리되고, zip 안의 잘못된 파일은 전체를 막음 · 상품마스터 · 허용 외 이름 거부', async () => {
  const b = await bufsP;
  const zipOf = (over = {}) => Buffer.from(zipSync(Object.fromEntries(FILES.map(d => [NAMES[d.id], new Uint8Array(over[d.id] || b.get(d.id))]))));
  let w = withMaster(world()); await w.addBundle('ERP_BUNDLE_a.zip', zipOf()); assert.equal(w.run(), 1);
  assert.deepEqual([w.source.files.length, w.processed.files.length], [0, 1]); assert.equal(w.tabs.size >= 7, true);
  w = withMaster(world()); const before = snap(w);
  await w.addBundle('ERP_BUNDLE_a.zip', zipOf({wms: b.get('inventory')}));
  assert.equal(w.run(), 0); assert.equal(snap(w), before); assert.equal(w.source.files[0].name, 'ERP_BUNDLE_a.zip');
  assert.match(w.problems().bundle.msg, /ERP_BUNDLE_a\.zip: 시트 종류가 이름과 맞지 않음/);
  for (const bad of ['상품마스터_전체_2026-11-12.xlsx', '기타자료_20261112.xlsx']) {
    w = withMaster(world()); const keep = snap(w);
    await w.addBundle('ERP_BUNDLE_a.zip', Buffer.from(zipSync({[NAMES.inventory]: new Uint8Array(b.get('inventory')), [bad]: new Uint8Array(b.get('wms'))})));
    assert.equal(w.run(), 0); assert.equal(snap(w), keep); assert.match(w.problems().bundle.msg, /허용되지 않는 탭 이름/);
  }
  w = withMaster(world());
  await w.addBundle('ERP_BUNDLE_a.zip', Buffer.from(zipSync({[NAMES.inventory]: new Uint8Array(b.get('inventory'))})));
  await w.addExcel(NAMES.schedule, b.get('schedule')); // zip + 낱개 엑셀이 한 묶음
  assert.equal(w.run(), 2); assert.equal(w.processed.files.length, 2);
});

test('폴더가 비어 있으면 아무 일도 안 하고, 임시 파일 · 다른 종류 파일은 건드리지 않음', async () => {
  const w = withMaster(world()); const before = snap(w);
  assert.equal(w.run(), 0);
  w.addFile(w.source, 'ERP_BUNDLE_old.zip.tmp', Buffer.from('x')); w.addFile(w.source, 'backup.zip', Buffer.from('x')); w.addFile(w.source, 'memo.txt', Buffer.from('x'));
  assert.equal(w.run(), 0); assert.equal(w.source.files.length, 3); assert.equal(snap(w), before); assert.equal(w.problems(), null);
});
