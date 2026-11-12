// Apps Script 추가 코드(ErpBundle.gs)를 가짜 Drive · 시트 객체 위에서 실행해 "전부 아니면 전무"와 상품마스터 보호를 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import mock from '../src/adapters/mock.js';
import {FILES, fileName} from '../src/files.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const GS = fs.readFileSync(new URL('../apps-script/ErpBundle.gs', import.meta.url), 'utf8');
// 기존 Apps Script 의 cleanBaseName (원본과 동일한 규칙)
const CLEAN = `function cleanBaseName(fileName) {
  let name = fileName.replace(/\\.(xlsx|xls)$/i, ''); name = name.replace(/\\s*\\(\\d+\\)\\s*$/, '');
  name = name.replace(/[_\\-\\s]?\\d{4}[-.]?\\d{2}[-.]?\\d{2}(?=[_\\-\\s]|$)/g, '');
  name = name.replace(/[_\\-\\s]{2,}/g, '_').replace(/[_\\-\\s]+$/, ''); name = name.trim(); return name || 'data'; }`;

function world({failWriteOn} = {}) {
  const tabs = new Map(); // 대상 스프레드시트: 이름 → 2차원 배열
  const props = {};
  const trashed = [];
  const mkSheet = (name, data = []) => { const sh = {name, data, getName: () => sh.name, setName: n => { tabs.delete(sh.name); sh.name = n; tabs.set(n, sh); }, clear: () => { sh.data = []; }, getDataRange: () => ({getValues: () => sh.data}), getRange: () => ({setValues: v => { if (failWriteOn && sh.name === failWriteOn) throw new Error('쓰기 실패(시뮬레이션)'); sh.data = v; }})}; tabs.set(name, sh); return sh; };
  const ss = {getSheetByName: n => tabs.get(n) || null, insertSheet: n => mkSheet(n), deleteSheet: sh => tabs.delete(sh.name), getSheets: () => [...tabs.values()]};
  const temps = new Map();
  const blob = (name, bytes) => ({getName: () => name, getBytes: () => bytes, data: bytes, setContentType() { return this; }});
  const folder = () => { const files = []; const f = {files, getFiles: () => { let i = 0; return {hasNext: () => i < files.length, next: () => files[i++]}; }}; return f; };
  const source = folder(), processed = folder();
  const addFile = (folderObj, name, bytes) => { const file = {name, bytes, parent: folderObj, getName: () => file.name, setName: n => { file.name = n; }, getBlob: () => blob(file.name, file.bytes), moveTo: t => { file.parent.files.splice(file.parent.files.indexOf(file), 1); t.files.push(file); file.parent = t; }}; folderObj.files.push(file); return file; };
  const ctx = {
    TARGET_SPREADSHEET_ID: 'T', MimeType: {GOOGLE_SHEETS: 'sheets'}, Logger: {log() {}},
    PropertiesService: {getScriptProperties: () => ({setProperty: (k, v) => { props[k] = v; }, getProperty: k => props[k]})},
    SpreadsheetApp: {openById: id => (id === 'T' ? ss : temps.get(id))},
    DriveApp: {getFileById: id => ({setTrashed: () => trashed.push(id)})},
    Drive: {Files: {create: (meta, b) => { const id = 'tmp' + temps.size; const wb = XLSX.read(Buffer.from(b.data), {type: 'buffer'}); temps.set(id, {getSheets: () => wb.SheetNames.map(n => ({getDataRange: () => ({getValues: () => XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: false, defval: ''})})}))}); return {id}; }}},
    Utilities: {unzip: b => new AdmZip(Buffer.from(b.data)).getEntries().map(e => blob(e.entryName, e.getData()))},
  };
  vm.createContext(ctx); vm.runInContext(CLEAN + '\n' + GS, ctx);
  return {temps, ctx, tabs, mkSheet, source, processed, addFile, props, trashed, run: () => vm.runInContext('processErpBundles_', ctx)(source, processed)};
}

async function bundle(tweak, entries = FILES) {
  const a = await mock({tweak}).fetchAll(FILES, NOW);
  const zip = new AdmZip(); entries.forEach(d => zip.addFile(fileName(d, NOW), a.get(d.id)));
  return zip.toBuffer();
}
const snap = w => JSON.stringify([...w.tabs].map(([n, s]) => [n, s.data]));

test('정상: 5개 탭이 기존 탭 이름으로 교체되고 상품마스터는 그대로, 묶음은 처리완료로 이동', async () => {
  const w = world();
  w.mkSheet('상품마스터', [['상품코드', '아웃무게g'], ['SB001', 100]]);
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]);
  w.mkSheet('유통기한_옛이름', [['그대로 남음']]);
  const master = JSON.stringify(w.tabs.get('상품마스터').data);
  w.addFile(w.source, 'ERP_BUNDLE_20261112-100000_abcd1234.zip', await bundle());
  assert.equal(w.run(), 1);
  assert.deepEqual([...w.tabs.keys()].sort(), ['가용재고조회_olive', '상품마스터', '유통기한', '유통기한_옛이름', '일자별판매실적분석_B2B1팀', '일자별판매실적분석_B2B2팀', '제품일정표']);
  assert.notEqual(w.tabs.get('가용재고조회_olive').data[0][0], '옛 데이터');
  assert.equal(JSON.stringify(w.tabs.get('상품마스터').data), master);
  assert.deepEqual([w.source.files.length, w.processed.files.length], [0, 1]);
  assert.equal(w.props.UPDATE_BY, '수집기(자동)');
  assert.equal(w.trashed.length, 5); // 임시 변환 시트 전부 정리
});

test('묶음 안 파일 하나가 비어 있으면 시트는 하나도 안 바뀌고 FAILED_ 로 표시', async () => {
  const w = world();
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('상품마스터', [['상품코드']]);
  const before = snap(w);
  w.addFile(w.source, 'ERP_BUNDLE_a.zip', await bundle(rows => { rows.expiry = [['유통기한']]; }));
  assert.equal(w.run(), 0);
  assert.equal(snap(w), before);
  assert.equal(w.source.files[0].name, 'FAILED_ERP_BUNDLE_a.zip');
  assert.match(JSON.parse(w.props.BUNDLE_ERROR).msg, /데이터가 없음|시트가 1개/);
  assert.ok(w.temps.size >= 1 && w.trashed.length === w.temps.size); // 만든 임시 시트는 실패해도 전부 정리
});

test('교체 중간에 쓰기가 실패해도 기존 시트는 그대로 (임시 탭 정리)', async () => {
  const w = world({failWriteOn: '__new_일자별판매실적분석_B2B2팀'});
  w.mkSheet('가용재고조회_olive', [['옛 데이터']]); w.mkSheet('제품일정표', [['옛 일정']]); w.mkSheet('상품마스터', [['상품코드']]);
  const before = snap(w);
  w.addFile(w.source, 'ERP_BUNDLE_a.zip', await bundle());
  assert.equal(w.run(), 0);
  assert.equal(snap(w), before);
  assert.ok(![...w.tabs.keys()].some(n => n.startsWith('__new_') || n.startsWith('__old_')));
  assert.equal(w.source.files[0].name, 'FAILED_ERP_BUNDLE_a.zip');
});

test('상품마스터 탭 이름이거나 허용되지 않은 이름의 파일이 묶음에 있으면 거부', async () => {
  for (const bad of ['상품마스터_20261112.xlsx', '기타자료_20261112.xlsx']) {
    const w = world(); w.mkSheet('상품마스터', [['상품코드', '옛']]);
    const before = snap(w);
    const good = await mock().fetchAll(FILES, NOW);
    const zip = new AdmZip(); zip.addFile(fileName(FILES[0], NOW), good.get('inventory')); zip.addFile(bad, good.get('expiry'));
    w.addFile(w.source, 'ERP_BUNDLE_a.zip', zip.toBuffer());
    assert.equal(w.run(), 0); assert.equal(snap(w), before); assert.match(JSON.parse(w.props.BUNDLE_ERROR).msg, /허용되지 않는 탭 이름/);
  }
});

test('같은 탭 이름 두 개 · 엑셀이 아닌 파일 · 빈 zip 은 거부', async () => {
  const good = await mock().fetchAll(FILES, NOW);
  for (const make of [
    () => { const z = new AdmZip(); z.addFile('가용재고조회_olive_20261112.xlsx', good.get('inventory')); z.addFile('가용재고조회_olive_20261113 (1).xlsx', good.get('inventory')); return z.toBuffer(); },
    () => { const z = new AdmZip(); z.addFile('가용재고조회_olive_20261112.csv', Buffer.from('a,b')); return z.toBuffer(); },
    () => new AdmZip().toBuffer(),
  ]) {
    const w = world(); w.mkSheet('가용재고조회_olive', [['옛']]); const before = snap(w);
    w.addFile(w.source, 'ERP_BUNDLE_a.zip', make());
    assert.equal(w.run(), 0); assert.equal(snap(w), before);
  }
});

test('수동 업로드 파일(엑셀)과 다른 이름의 zip 은 건드리지 않음', async () => {
  const w = world();
  w.addFile(w.source, 'ERP_BUNDLE_old.zip.tmp', Buffer.from('x')); w.addFile(w.source, '가용재고조회_olive_20261112.xlsx', Buffer.from('x')); w.addFile(w.source, 'backup.zip', Buffer.from('x'));
  assert.equal(w.run(), 0); assert.equal(w.source.files.length, 3);
});
