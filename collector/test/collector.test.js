import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {runOnce} from '../src/run.js';
import {acquire} from '../src/lock.js';
import mock from '../src/adapters/mock.js';
import {FILES} from '../src/files.js';

const T0 = new Date('2026-11-12T01:00:00Z');
const later = m => new Date(T0.getTime() + m * 60000);
function env(adapterOpts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-'));
  const config = {uploadFolder: path.join(root, 'upload'), workDir: path.join(root, 'work')};
  fs.mkdirSync(config.uploadFolder);
  const run = (now = T0, adapter = mock(adapterOpts)) => runOnce({config, adapter, now});
  const ls = () => fs.readdirSync(config.uploadFolder);
  const state = () => JSON.parse(fs.readFileSync(path.join(config.workDir, 'state.json'), 'utf8'));
  return {config, run, ls, state};
}

test('정상: 묶음 zip 1개에 파일 5개, 기존 이름 규칙 (날짜만 붙음), 임시 파일 안 남음', async () => {
  const e = env();
  const r = await e.run();
  assert.equal(r.result, 'published');
  assert.deepEqual(e.ls(), [r.bundle]);
  const names = new AdmZip(path.join(e.config.uploadFolder, r.bundle)).getEntries().map(x => x.entryName).sort();
  assert.deepEqual(names, ['WMS창고재고관리(EMP)_olive_20261112.xlsx', '가용재고조회_olive_20261112.xlsx', '일자별판매실적분석_20261112_B2B1팀.xlsx', '일자별판매실적분석_20261112_B2B2팀.xlsx', '제품일정표_olive_20261112.xlsx']);
  assert.ok(!names.some(n => n.includes('상품마스터')));
  assert.ok(e.state().lastSuccessAt);
});

test('변경 없음: 올리지 않고 확인 시각만 갱신 (처리 대기 묶음 치운 뒤)', async () => {
  const e = env();
  const a = await e.run();
  fs.rmSync(path.join(e.config.uploadFolder, a.bundle)); // Apps Script 가 처리해 갔다고 가정
  const r = await e.run(later(30), mock());
  assert.equal(r.result, 'unchanged'); assert.deepEqual(e.ls(), []);
  assert.equal(e.state().lastCheckedAt, later(30).getTime());
});

test('데이터가 바뀌면 새 묶음', async () => {
  const e = env();
  const a = await e.run(); fs.rmSync(path.join(e.config.uploadFolder, a.bundle));
  const r = await e.run(later(30), mock({tweak: rows => rows.inventory.push(['B2B1팀 창고', 'ZZ001', '신규', '8800000009999', '', '5', '5', '0', '0', '0'])}));
  assert.equal(r.result, 'published'); assert.notEqual(r.bundle, a.bundle);
});

for (const [name, tweak, msg] of [
  ['파일 하나 없음', rows => { delete rows.sales2; }, /sales2: 파일을 받지 못함/],
  ['엉뚱한 종류의 시트', rows => { rows.wms = rows.inventory; }, /wms: 시트 종류가 inventory/],
  ['데이터 행 없음', rows => { rows.inventory = rows.inventory.slice(0, 2); }, /inventory: 데이터 행이 없음/],
  ['B2B2 자리에 B1 판매', rows => { rows.sales2 = rows.sales1; }, /sales2: 팀이 B2B1팀/],
]) {
  test(`불완전·이상 묶음은 아무것도 올리지 않음: ${name}`, async () => {
    const e = env({tweak});
    const r = await e.run();
    assert.equal(r.result, 'invalid'); assert.match(r.error, msg);
    assert.deepEqual(e.ls(), []);
    assert.equal(e.state().lastSuccessAt, undefined); assert.match(e.state().lastError.msg, msg);
  });
}

test('행 수 급감(직전 대비 절반 미만)은 올리지 않고, 마지막 성공 기록은 그대로', async () => {
  const e = env({tweak: rows => { while (rows.sales1.length < 40) rows.sales1.push(rows.sales1[5]); }});
  const a = await e.run(); fs.rmSync(path.join(e.config.uploadFolder, a.bundle));
  const before = e.state();
  const r = await e.run(later(30), mock({tweak: rows => { while (rows.sales1.length < 40) rows.sales1.push(rows.sales1[5]); rows.sales1.length = 12; }}));
  assert.equal(r.result, 'invalid'); assert.match(r.error, /급감/);
  assert.equal(e.state().lastHash, before.lastHash); assert.equal(e.state().lastSuccessAt, before.lastSuccessAt);
  assert.deepEqual(e.ls(), []);
});

test('실패 후 정상으로 돌아오면 다시 올림 (오류 기록 삭제)', async () => {
  const e = env();
  assert.equal((await e.run(T0, mock({tweak: rows => { delete rows.wms; }}))).result, 'invalid');
  const r = await e.run(later(30), mock());
  assert.equal(r.result, 'published'); assert.equal(e.state().lastError, undefined);
});

test('ERP 오류(예외)는 올리지 않고 기록만', async () => {
  const e = env();
  const r = await e.run(T0, {fetchAll: async () => { throw new Error('로그인 실패'); }});
  assert.equal(r.result, 'error'); assert.deepEqual(e.ls(), []); assert.match(e.state().lastError.msg, /로그인 실패/);
});

test('겹침 방지: 잠금이 있으면 건너뜀, 30분 넘은 죽은 잠금은 무시', async () => {
  const e = env();
  fs.mkdirSync(e.config.workDir, {recursive: true});
  const lock = path.join(e.config.workDir, 'run.lock');
  const release = acquire(lock, T0.getTime());
  assert.equal(acquire(lock, T0.getTime() + 1000), null);
  assert.equal((await e.run(later(1))).result, 'busy');
  release();
  fs.writeFileSync(lock, JSON.stringify({pid: 1, at: T0.getTime()}));
  assert.equal((await e.run(later(31))).result, 'published');
  assert.ok(!fs.existsSync(lock));
});

test('이전 묶음이 처리 대기 중이면 쌓지 않음', async () => {
  const e = env();
  await e.run();
  const r = await e.run(later(30), mock({tweak: rows => rows.inventory.push(['B2B1팀 창고', 'ZZ002', 'x', '8800000009998', '', '1', '1', '0', '0', '0'])}));
  assert.equal(r.result, 'pending'); assert.equal(e.ls().length, 1);
});

test('Apps Script 가 거부한 묶음(FAILED_)이 있으면 보관하고 같은 데이터를 다시 올림', async () => {
  const e = env();
  const a = await e.run();
  fs.renameSync(path.join(e.config.uploadFolder, a.bundle), path.join(e.config.uploadFolder, 'FAILED_' + a.bundle));
  const r = await e.run(later(30));
  assert.equal(r.result, 'published'); assert.notEqual(r.bundle, a.bundle);
  assert.ok(fs.existsSync(path.join(e.config.workDir, 'failed', 'FAILED_' + a.bundle)));
  assert.deepEqual(e.ls(), [r.bundle]);
});

test('상품마스터는 수집 대상이 아님', () => {
  assert.ok(!FILES.some(d => /상품마스터|productMaster/.test(d.file + d.type)));
});

test('이름 규칙: 수집기 파일 이름 → 탭 이름(기존 cleanBaseName) → 대시보드가 팀 · 종류를 이름으로 정확히 인식', async () => {
  const {teamFromName} = await import('../../web/src/lib/parse.js');
  const clean = n => { let s = n.replace(/\.(xlsx|xls)$/i, ''); s = s.replace(/\s*\(\d+\)\s*$/, ''); s = s.replace(/[_\-\s]?\d{4}[-.]?\d{2}[-.]?\d{2}(?=[_\-\s]|$)/g, ''); return s.replace(/[_\-\s]{2,}/g, '_').replace(/[_\-\s]+$/, '').trim(); };
  const {fileName} = await import('../src/files.js');
  assert.deepEqual(FILES.map(d => clean(fileName(d, T0))), ['가용재고조회_olive', 'WMS창고재고관리(EMP)_olive', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표_olive']);
  assert.deepEqual(FILES.filter(d => d.team).map(d => teamFromName(clean(fileName(d, T0)))), ['B2B1팀', 'B2B2팀']);
  // 옛 이름(팀 없음)은 이름으로는 팀을 못 정하고 부서 열로 정함 → 수집기는 항상 '팀' 이 붙은 이름을 씀
  assert.equal(teamFromName('일자별판매실적분석_B2B1'), null);
  assert.equal(teamFromName('일자별판매실적분석_B2B1팀'), 'B2B1팀');
});
