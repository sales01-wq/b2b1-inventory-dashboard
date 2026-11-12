// 저장본 검증(SnapshotGuard.gs): 잘못된 업로드가 마지막 정상 저장본을 덮어쓰지 못하는지, 상품마스터가 보존되는지
import test from 'node:test';
import assert from 'node:assert/strict';
import mock from '../src/adapters/mock.js';
import {FILES, fileName} from '../src/files.js';
import {makeSheets} from '../../web/src/lib/__fixtures__/sheets.js';
import {world, zipSync} from './gas-fake.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const sh = makeSheets(NOW.getTime());
const TABS = {'가용재고조회_olive': sh.inventory, '제품일정표_olive': sh.schedule, '일자별판매실적분석_B2B1팀': sh.sales1, '일자별판매실적분석_B2B2팀': sh.sales2, 'WMS창고재고관리(EMP)_olive': sh.expiry, '상품마스터_전체': sh.productMaster};
const filled = (over = {}) => { const w = world(); for (const [n, rows] of Object.entries({...TABS, ...over})) if (rows) w.mkSheet(n, rows); w.mkSheet('__설정', [['kind']]); return w; };

test('정상 상태: 저장본이 만들어지고 모든 탭(상품마스터 포함, __설정 제외)이 그대로 들어감, 통계 기록', () => {
  const w = filled();
  assert.equal(w.snapshot(), true);
  const json = w.snapshotJson();
  assert.deepEqual(Object.keys(json).sort(), Object.keys(TABS).sort());
  assert.deepEqual(json['상품마스터_전체'], sh.productMaster);
  const info = JSON.parse(w.props.SNAPSHOT_INFO);
  assert.ok(info.at && info.stats.rows.inventory > 5 && info.stats.rows.productMaster > 0);
  assert.equal(w.problems(), null);
});

test('잘못된 시트 상태는 저장본을 바꾸지 않고 이전 저장본 유지 + 문제 기록, 정상으로 돌아오면 문제 해제', () => {
  const w = filled();
  w.snapshot(); const good = w.props.SNAPSHOT_FILE_ID, goodInfo = w.props.SNAPSHOT_INFO;
  for (const [label, mutate, msg] of [
    ['가용재고 내용이 비어 있음', () => { w.tabs.get('가용재고조회_olive').data = sh.inventory.slice(0, 2); }, /필수 시트 내용이 없거나.*inventory/],
    ['판매실적이 전부 엉뚱한 내용', () => { for (const n of ['일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀']) w.tabs.get(n).data = [['아무', '내용']]; }, /sales/],
    ['상품마스터 탭이 사라짐', () => { w.tabs.delete('상품마스터_전체'); }, /상품마스터가 저장본에서 빠짐/],
  ]) {
    const backup = new Map([...w.tabs].map(([n, s]) => [n, s.data]));
    mutate();
    assert.equal(w.snapshot(), false, label);
    assert.equal(w.props.SNAPSHOT_FILE_ID, good, label); assert.equal(w.props.SNAPSHOT_INFO, goodInfo, label); // 이전 저장본 그대로
    assert.match(w.problems().snapshot.msg, msg, label);
    assert.equal(w.trashed.length, 0, label);
    w.tabs.clear(); for (const [n, d] of backup) w.mkSheet(n, d); // 원상 복구
  }
  assert.equal(w.snapshot(), true); assert.notEqual(w.props.SNAPSHOT_FILE_ID, good);
  assert.equal(w.problems(), null); assert.equal(w.trashed.length, 1); // 새 저장본 확정 뒤에만 옛 파일 정리
});

test('행 수가 절반 아래로 급감하면 거부 (20행 이상일 때만 비교)', () => {
  const big = [...sh.sales1, ...Array.from({length: 40}, (_, i) => sh.sales1[5].map((c, j) => (j === 0 ? `X${i}` : c)))];
  const w = filled({'일자별판매실적분석_B2B1팀': big});
  assert.equal(w.snapshot(), true);
  w.tabs.get('일자별판매실적분석_B2B1팀').data = sh.sales1.slice(0, 12);
  w.tabs.get('일자별판매실적분석_B2B2팀').data = sh.sales2.slice(0, 3);
  assert.equal(w.snapshot(), false); assert.match(w.problems().snapshot.msg, /행 수가 급감함: sales/);
});

test('처음 만드는 저장본은 비교 대상이 없어 필수 종류만 확인 (상품마스터가 없어도 허용)', () => {
  const w = filled({'상품마스터_전체': null}); assert.equal(w.snapshot(), true);
  assert.equal(filled({'가용재고조회_olive': null}).snapshot(), false);
});

test('묶음 안 파일의 내용 종류가 이름과 맞지 않으면 시트를 하나도 바꾸지 않고 문제로 보고', async () => {
  const w = filled();
  const before = JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));
  const bufs = await mock().fetchAll(FILES, NOW);
  const entries = Object.fromEntries(FILES.map(d => [fileName(d, NOW), new Uint8Array(bufs.get(d.id === 'wms' ? 'inventory' : d.id))])); // WMS 자리에 가용재고 내용
  await w.addBundle('ERP_BUNDLE_a.zip', Buffer.from(zipSync(entries)));
  assert.equal(w.run(), 0);
  assert.equal(JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data])), before);
  assert.match(JSON.parse(w.props.BUNDLE_ERROR).msg, /시트 종류가 맞지 않음.*WMS창고재고관리.*inventory, 기대 expiry/);
  assert.match(w.problems().bundle.msg, /시트 종류가 맞지 않음/);
  // 올바른 묶음이 처리되면 묶음 문제도 해제
  await w.addBundle('ERP_BUNDLE_b.zip', Buffer.from(zipSync(Object.fromEntries(FILES.map(d => [fileName(d, NOW), new Uint8Array(bufs.get(d.id))])))));
  assert.equal(w.run(), 1); assert.equal(w.problems(), null);
});
