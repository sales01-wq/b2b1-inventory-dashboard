// Apps Script 추가 코드(ErpBundle.gs)를 가짜 Drive · 시트 객체 위에서 실행해 "전부 아니면 전무"와 상품마스터 보호를 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, unzipSync} from 'fflate';
import mock from '../src/adapters/mock.js';
import {FILES, fileName} from '../src/files.js';
import {world} from './gas-fake.js';

const NOW = new Date('2026-11-12T01:00:00Z');
async function bundle(tweak, entries = FILES) {
  const a = await mock({tweak}).fetchAll(FILES, NOW);
  return Buffer.from(zipSync(Object.fromEntries(entries.map(d => [fileName(d, NOW), new Uint8Array(a.get(d.id))]))));
}
const snap = w => JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));

test('정상: 5개 탭이 기존 탭 이름으로 교체되고 상품마스터는 그대로, 묶음은 처리완료로 이동', async () => {
  const w = world();
  w.mkSheet('상품마스터_전체', [['상품코드', '아웃무게g'], ['SB001', 100]]);
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]);
  w.mkSheet('유통기한_옛이름', [['그대로 남음']]);
  const master = JSON.stringify(w.tabs.get('상품마스터_전체').data);
  await w.addBundle('ERP_BUNDLE_20261112-100000_abcd1234.zip', await bundle());
  assert.equal(w.run(), 1);
  assert.deepEqual([...w.tabs.keys()].sort(), ['WMS창고재고관리(EMP)_olive', '가용재고조회_olive', '상품마스터_전체', '유통기한_옛이름', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표_olive']);
  assert.notEqual(w.tabs.get('가용재고조회_olive').data[0][0], '옛 데이터');
  assert.equal(JSON.stringify(w.tabs.get('상품마스터_전체').data), master);
  assert.deepEqual([w.source.files.length, w.processed.files.length], [0, 1]);
  assert.equal(w.props.UPDATE_BY, '수집기(자동)');
  assert.equal(w.trashed.length, 5); // 임시 변환 시트 전부 정리
});

test('묶음 안 파일 하나가 비어 있으면 시트는 하나도 안 바뀌고 FAILED_ 로 표시', async () => {
  const w = world();
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('상품마스터_전체', [['상품코드']]);
  const before = snap(w);
  await w.addBundle('ERP_BUNDLE_a.zip', await bundle(rows => { rows.wms = [['유통기한']]; }));
  assert.equal(w.run(), 0);
  assert.equal(snap(w), before);
  assert.equal(w.source.files[0].name, 'FAILED_ERP_BUNDLE_a.zip');
  assert.match(JSON.parse(w.props.BUNDLE_ERROR).msg, /데이터가 없음|시트가 1개/);
  assert.ok(w.temps.size >= 1 && w.trashed.length === w.temps.size); // 만든 임시 시트는 실패해도 전부 정리
});

test('교체 중간에 쓰기가 실패해도 기존 시트는 그대로 (임시 탭 정리)', async () => {
  const w = world({failWriteOn: '__new_일자별판매실적분석_B2B2팀'});
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('제품일정표_olive', [['옛 일정']]); w.mkSheet('상품마스터_전체', [['상품코드']]);
  const before = snap(w);
  await w.addBundle('ERP_BUNDLE_a.zip', await bundle());
  assert.equal(w.run(), 0);
  assert.equal(snap(w), before);
  assert.ok(![...w.tabs.keys()].some(n => n.startsWith('__new_') || n.startsWith('__old_')));
  assert.equal(w.source.files[0].name, 'FAILED_ERP_BUNDLE_a.zip');
});

test('상품마스터 탭 이름이거나 허용되지 않은 이름의 파일이 묶음에 있으면 거부', async () => {
  for (const bad of ['상품마스터_전체_2026-11-12.xlsx', '기타자료_20261112.xlsx']) {
    const w = world(); w.mkSheet('상품마스터_전체', [['상품코드', '옛']]);
    const before = snap(w);
    const good = await mock().fetchAll(FILES, NOW);
    await w.addBundle('ERP_BUNDLE_a.zip', Buffer.from(zipSync({[fileName(FILES[0], NOW)]: new Uint8Array(good.get('inventory')), [bad]: new Uint8Array(good.get('wms'))})));
    assert.equal(w.run(), 0); assert.equal(snap(w), before); assert.match(JSON.parse(w.props.BUNDLE_ERROR).msg, /허용되지 않는 탭 이름/);
  }
});

test('같은 탭 이름 두 개 · 엑셀이 아닌 파일 · 빈 zip 은 거부', async () => {
  const good = await mock().fetchAll(FILES, NOW);
  for (const make of [
    () => zipSync({'가용재고조회_olive_20261112.xlsx': new Uint8Array(good.get('inventory')), '가용재고조회_olive_20261113 (1).xlsx': new Uint8Array(good.get('inventory'))}),
    () => zipSync({'가용재고조회_olive_20261112.csv': new TextEncoder().encode('a,b')}),
    () => zipSync({}),
  ]) {
    const w = world(); w.mkSheet('가용재고조회_olive', [['옛']]); const before = snap(w);
    await w.addBundle('ERP_BUNDLE_a.zip', Buffer.from(make()));
    assert.equal(w.run(), 0); assert.equal(snap(w), before);
  }
});

test('수동 업로드 파일(엑셀)과 다른 이름의 zip 은 건드리지 않음', async () => {
  const w = world();
  w.addFile(w.source, 'ERP_BUNDLE_old.zip.tmp', Buffer.from('x')); w.addFile(w.source, '가용재고조회_olive_20261112.xlsx', Buffer.from('x')); w.addFile(w.source, 'backup.zip', Buffer.from('x'));
  assert.equal(w.run(), 0); assert.equal(w.source.files.length, 3);
});
