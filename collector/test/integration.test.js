// 실제 기존 Apps Script 코드(original/Code.redacted.gs) + 연결 수정 3곳 + 새 파일 3개를 한 프로젝트처럼 합쳐서 실행:
// 이름 충돌 · 중복 정의가 없는지, 기존 진입점(checkForNewFiles, doGet 의 bundle / meta / progress)이 새 코드를 거쳐 제대로 동작하는지 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import mock from '../src/adapters/mock.js';
import {FILES, fileName} from '../src/files.js';
import {makeSheets} from '../../web/src/lib/__fixtures__/sheets.js';
import {world, integratedSource} from './gas-fake.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const sh = makeSheets(NOW.getTime());
const read = f => fs.readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8');

test('합친 프로젝트에 같은 이름의 함수 · 상수가 둘 이상 없음 (나중 것이 조용히 덮어쓰는 사고 방지)', () => {
  const src = [integratedSource(), read('SnapshotGuard.gs'), read('Batch.gs'), read('DryRun.gs')].join('\n');
  const names = [...src.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=)/gm)].map(m => m[1] || m[2]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, []);
  assert.ok(names.includes('checkForNewFilesInnerLegacy_') && names.includes('buildSnapshotLegacy_') && names.includes('checkForNewFilesInner_') && names.includes('buildSnapshot_'));
});

test('기존 진입점으로 끝까지: 엑셀 5개 → checkForNewFiles(잠금 · 진행 상태 포함) → 새 묶음 처리 → 검사된 저장본 → doGet(bundle)', async () => {
  const w = world({original: true}); const b = await mock().fetchAll(FILES, NOW);
  w.mkSheet('상품마스터_전체', sh.productMaster); w.mkSheet('__설정', [['kind']]);
  for (const d of FILES) await w.addExcel(fileName(d, NOW), b.get(d.id));
  w.call('checkForNewFiles');
  assert.equal(w.processed.files.filter(f => f.name.endsWith('.xlsx')).length, 5); assert.equal(w.source.files.length, 0);
  assert.equal(JSON.parse(w.props.PROGRESS).status, 'done');
  const r = w.doGet({key: 'k', action: 'bundle'});
  assert.ok(r.b64 && r.snapshot.at && r.lastUpdate.files === 5 && r.problem === null);
  const json = JSON.parse(zlib.gunzipSync(Buffer.from(r.b64, 'base64')).toString('utf8'));
  assert.deepEqual(Object.keys(json).sort(), ['WMS창고재고관리(EMP)_olive', '가용재고조회_olive', '상품마스터_전체', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표_olive']);
  assert.deepEqual(w.doGet({key: 'k', action: 'meta'}).sheets.map(s => s.name).sort(), Object.keys(json).sort());
  assert.deepEqual(w.doGet({key: 'bad', action: 'bundle'}), {error: 'unauthorized'});
});

test('기존 진입점으로: 5개 중 하나가 잘못되면 시트 · 저장본 그대로, bundle 응답의 problem 에 이유 (대시보드가 보여 줌)', async () => {
  const w = world({original: true}); const b = await mock().fetchAll(FILES, NOW);
  w.mkSheet('상품마스터_전체', sh.productMaster); w.mkSheet('__설정', [['kind']]);
  for (const d of FILES) await w.addExcel(fileName(d, NOW), b.get(d.id));
  w.call('checkForNewFiles'); const good = w.props.SNAPSHOT_FILE_ID, sheets = JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));
  for (const d of FILES) await w.addExcel(fileName(d, new Date(NOW.getTime() + 86400000)), b.get(d.id === 'sales2' ? 'inventory' : d.id)); // 다음 날 파일: B2B2 판매실적 자리에 가용재고 내용
  w.call('checkForNewFiles');
  assert.equal(JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data])), sheets);
  assert.equal(w.props.SNAPSHOT_FILE_ID, good); assert.equal(w.source.files.length, 5);
  const r = w.doGet({key: 'k', action: 'bundle', have: ''});
  assert.match(r.problem.bundle.msg, /일자별판매실적분석_20261113_B2B2팀\.xlsx: 시트 종류가 이름과 맞지 않음.*sales.*inventory/);
});

test('기존 5분 트리거 · start · ensure · progress 는 그대로 동작하고, 설정은 skey 로 항목마다 따로 저장 (GAS_KEY 가 설정 이름을 덮어쓰지 않음)', async () => {
  const w = world({original: true});
  assert.equal(w.doGet({key: 'k', action: 'progress'}).status === undefined, false);
  assert.deepEqual(w.doGet({key: 'k', action: 'ensure'}), {ok: true, scheduled: true});
  assert.deepEqual(w.doGet({key: 'k', action: 'start', by: 'a@b.c'}), {ok: true});
  assert.deepEqual(w.doGet({key: 'k', action: 'settings_get'}), {items: []});
  for (const pn of ['SB001', 'SB002']) assert.deepEqual(w.doGet({key: 'k', action: 'settings_set', kind: 'box', skey: pn, value: JSON.stringify({아웃W: 400}), by: 'a@b.c'}), {ok: true});
  const items = w.doGet({key: 'k', action: 'settings_get'}).items;
  assert.deepEqual(items.map(i => [i.kind, i.key]), [['box', 'SB001'], ['box', 'SB002']]);
  assert.ok(!JSON.stringify(items).includes('"k"')); // 비밀 키가 설정에 섞이지 않음
  assert.deepEqual(w.doGet({key: 'k', action: 'settings_del', kind: 'box', skey: 'SB001'}), {ok: true});
  assert.deepEqual(w.doGet({key: 'k', action: 'settings_get'}).items.map(i => i.key), ['SB002']);
  // 옛 API(skey 없이 key 에 설정 이름)와의 호환: 이전 동작 그대로 (배포 중간 상태)
  assert.deepEqual(w.doGet({key: 'k', action: 'settings_set', kind: 'rules', value: '{}', by: 'x'}), {ok: true});
});
