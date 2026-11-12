import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {unzipSync} from 'fflate';
import mock from '../src/adapters/mock.js';
import {FILES} from '../src/files.js';
import {classify, packFolder} from '../src/pack.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
async function setup(names) { // names: 파일 이름 → fixture id (또는 Buffer)
  const dir = tmp(), bufs = await mock().fetchAll(FILES, NOW);
  for (const [n, id] of Object.entries(names)) fs.writeFileSync(path.join(dir, n), Buffer.isBuffer(id) ? id : bufs.get(id));
  return {dir, out: path.join(dir, 'out'), bufs};
}
const REAL = {'가용재고조회_olive_20261013.xlsx': 'inventory', 'WMS창고재고관리(EMP)_olive_20261013.xlsx': 'wms', '일자별판매실적분석_20261013_B2B1팀.xlsx': 'sales1', '일자별판매실적분석_20261013_B2B2팀.xlsx': 'sales2', '제품일정표_olive_20261013.xlsx': 'schedule', '상품마스터_전체_2026-10-13.xlsx': 'inventory'};

test('이름 분류: 날짜 · (1) · 팀 유무가 달라도 알아보고, 상품마스터는 건너뜀', () => {
  assert.deepEqual(classify('일자별판매실적분석_20261013_B2B1.xlsx'), {kind: 'file', id: 'sales', team: 'B2B1팀'});
  assert.deepEqual(classify('일자별판매실적분석_20261013_B2B2팀 (1).xlsx'), {kind: 'file', id: 'sales', team: 'B2B2팀'});
  assert.deepEqual(classify('일자별판매실적분석_20260831.xlsx'), {kind: 'file', id: 'sales', team: null});
  assert.equal(classify('상품마스터_전체_2026-10-13.xlsx').kind, 'skip');
  assert.equal(classify('가용재고조회_olive_20261013 (2).xlsx').id, 'inventory');
  assert.equal(classify('WMS창고재고관리(EMP)_olive_20261013.xlsx').id, 'wms');
  assert.equal(classify('메모.xlsx').kind, 'skip');
});

test('정상: 5개 + 상품마스터 + 임시파일이 섞여 있어도 5개만 기존 이름으로 만들고 zip 도 만듦', async () => {
  const {dir, out} = await setup(REAL); fs.writeFileSync(path.join(dir, '~$임시.xlsx'), 'x');
  const r = await packFolder({dir, out, now: NOW});
  assert.equal(r.ok, true, r.errors.join(' | '));
  assert.deepEqual(fs.readdirSync(out).filter(f => f.endsWith('.xlsx')).sort(), ['WMS창고재고관리(EMP)_olive_20261112.xlsx', '가용재고조회_olive_20261112.xlsx', '일자별판매실적분석_20261112_B2B1팀.xlsx', '일자별판매실적분석_20261112_B2B2팀.xlsx', '제품일정표_olive_20261112.xlsx']);
  assert.deepEqual(Object.keys(unzipSync(new Uint8Array(fs.readFileSync(path.join(out, r.bundle))))).length, 5);
  assert.ok(r.notes.some(n => /상품마스터/.test(n) && /건너뜀/.test(n)));
});

test('옛 이름(팀 없음)은 부서 열로 판단하고, 같은 종류가 여러 개면 가장 최신만 사용', async () => {
  const names = {...REAL}; delete names['일자별판매실적분석_20261013_B2B1팀.xlsx']; delete names['일자별판매실적분석_20261013_B2B2팀.xlsx']; delete names['상품마스터_전체_2026-10-13.xlsx'];
  const {dir, out, bufs} = await setup({...names, '일자별판매실적분석_20261013_B2B1.xlsx': 'sales1', '일자별판매실적분석_20261013_B2B2.xlsx': 'sales2'});
  fs.writeFileSync(path.join(dir, '가용재고조회_olive_20261012.xlsx'), bufs.get('inventory'));
  fs.utimesSync(path.join(dir, '가용재고조회_olive_20261012.xlsx'), new Date('2026-10-01'), new Date('2026-10-01'));
  const r = await packFolder({dir, out, now: NOW});
  assert.equal(r.ok, true, r.errors.join(' | '));
  assert.ok(r.notes.some(n => /무시: 가용재고조회_olive_20261012/.test(n)));
});

test('하나라도 없거나 잘못되면 아무것도 만들지 않음', async () => {
  for (const [label, mutate, msg] of [
    ['판매실적 B2B2 없음', n => delete n['일자별판매실적분석_20261013_B2B2팀.xlsx'], /B2B2팀\.xlsx 에 해당하는 파일이 없습니다/],
    ['WMS 자리에 가용재고', n => { n['WMS창고재고관리(EMP)_olive_20261013.xlsx'] = 'inventory'; }, /wms: 시트 종류가 inventory/],
    ['B2B2 이름인데 내용은 B2B1', n => { n['일자별판매실적분석_20261013_B2B2팀.xlsx'] = 'sales1'; }, /sales2: 팀이 B2B1팀/],
    ['팀을 알 수 없는 판매실적', n => { delete n['일자별판매실적분석_20261013_B2B1팀.xlsx']; n['일자별판매실적분석_20260831.xlsx'] = Buffer.from('not-excel'); }, /어느 팀인지 알 수 없습니다/],
    ['엑셀이 아닌 내용', n => { n['제품일정표_olive_20261013.xlsx'] = Buffer.from('garbage'); }, /엑셀을 읽을 수 없음/],
  ]) {
    const names = {...REAL}; delete names['상품마스터_전체_2026-10-13.xlsx']; mutate(names);
    const {dir, out} = await setup(names);
    const r = await packFolder({dir, out, now: NOW});
    assert.equal(r.ok, false, label); assert.match(r.errors.join(' | '), msg, label);
    assert.ok(!fs.existsSync(out), label);
  }
});
