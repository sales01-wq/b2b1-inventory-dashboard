// Apps Script 추가 코드(Batch.gs · SnapshotGuard.gs)를 가짜 Drive · 시트 · 속성 객체 위에서 실행하는 시험 도구
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {zipSync, unzipSync} from 'fflate';
import {readSheets} from '../src/xlsx.js';

const read = f => fs.readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8');
// 기존 Apps Script 에 이미 있는 함수들 (원본과 같은 규칙)
const ORIGINAL = `function cleanBaseName(fileName) {
  let name = fileName.replace(/\\.(xlsx|xls)$/i, ''); name = name.replace(/\\s*\\(\\d+\\)\\s*$/, '');
  name = name.replace(/[_\\-\\s]?\\d{4}[-.]?\\d{2}[-.]?\\d{2}(?=[_\\-\\s]|$)/g, '');
  name = name.replace(/[_\\-\\s]{2,}/g, '_').replace(/[_\\-\\s]+$/, ''); name = name.trim(); return name || 'data'; }
function setProgress(status, currentFile, doneCount, totalCount) { PropertiesService.getScriptProperties().setProperty('PROGRESS', JSON.stringify({status: status, currentFile: currentFile})); }
function getSnapshotInfo_() { const raw = PropertiesService.getScriptProperties().getProperty('SNAPSHOT_INFO'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }`;

/** 실제 기존 코드(Code.redacted.gs)에 연결용 수정 3곳을 적용한 소스 (README · 가이드의 수정과 같음) */
export function integratedSource() {
  let src = read('original/Code.redacted.gs');
  const sub = (from, to) => { if (!src.includes(from)) throw new Error('원본에서 찾을 수 없음: ' + from); src = src.replace(from, to); };
  sub('function checkForNewFilesInner_() {', 'function checkForNewFilesInnerLegacy_() {');   // 수정 1
  sub('function buildSnapshot_() {', 'function buildSnapshotLegacy_() {');                  // 수정 2
  sub("const out = { snapshot: info, lastUpdate: lu ? JSON.parse(lu) : null };", "const out = { snapshot: info, lastUpdate: lu ? JSON.parse(lu) : null };\n    out.problem = readProblems_();"); // 수정 3
  sub("const kind = String(p.kind || ''), key = String(p.key || '');", "const kind = String(p.kind || ''), key = String(p.skey !== undefined ? p.skey : p.key || '');"); // 수정 4 (설정 이름은 skey)
  return src.replace(/'REDACTED'/g, m => m).replace("const SOURCE_FOLDER_ID = 'REDACTED'", "const SOURCE_FOLDER_ID = 'S'").replace("const PROCESSED_FOLDER_ID = 'REDACTED'", "const PROCESSED_FOLDER_ID = 'P'").replace("const TARGET_SPREADSHEET_ID = 'REDACTED'", "const TARGET_SPREADSHEET_ID = 'T'").replace("const API_KEY = 'REDACTED'", "const API_KEY = 'k'");
}

export function world({failWriteOn, original = false} = {}) {
  const tabs = new Map(); // 대상 스프레드시트: 이름 → 시트
  const logs = [], props = {}, trashed = [], temps = new Map(), parsed = new Map(), files = new Map();
  const hash = b => crypto.createHash('sha1').update(Buffer.from(b)).digest('hex');
  const mkSheet = (name, data = []) => {
    const sh = {name, data, getName: () => sh.name, setName: n => { tabs.delete(sh.name); sh.name = n; tabs.set(n, sh); }, clear: () => { sh.data = []; },
      getDataRange: () => ({getValues: () => sh.data}), appendRow: r => { sh.data.push(r); }, deleteRow: n => { sh.data.splice(n - 1, 1); }, getLastRow: () => sh.data.length, getLastColumn: () => (sh.data[0] || []).length,
      getRange: (r = 1, c = 1, nr = 1, nc = 1) => ({getValues: () => sh.data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)), setValues: v => { if (failWriteOn && sh.name === failWriteOn) throw new Error('쓰기 실패(시뮬레이션)'); sh.data = v; }})};
    tabs.set(name, sh); return sh;
  };
  const ss = {getSheetByName: n => tabs.get(n) || null, insertSheet: n => mkSheet(n), deleteSheet: sh => tabs.delete(sh.name), getSheets: () => [...tabs.values()]};
  const blob = (name, bytes) => ({getName: () => name, getBytes: () => bytes, data: bytes, setContentType() { return this; }, getDataAsString: () => Buffer.from(bytes).toString('utf8')});
  const folder = () => { const list = []; return {files: list, getFiles: () => { let i = 0; const l = list.slice(); return {hasNext: () => i < l.length, next: () => l[i++]}; }, getFilesByType: t => { let i = 0; const l = list.filter(f => t === 'xlsx' && /\.xlsx$/i.test(f.name)); return {hasNext: () => i < l.length, next: () => l[i++]}; }, createFile: b => addFile(f2, b.getName(), Buffer.from(b.data))}; };
  const source = folder(), processed = folder();
  let f2 = processed; // createFile 은 처리완료 폴더에 만든다
  let seq = 0;
  function addFile(folderObj, name, bytes) {
    const id = 'f' + ++seq;
    const file = {id, name, bytes, parent: folderObj, getId: () => id, getSize: () => bytes.length, getName: () => file.name, setName: n => { file.name = n; }, setTrashed: v => { if (v) trashed.push(id); }, getBlob: () => blob(file.name, file.bytes),
      getMimeType: () => (/\.xlsx$/i.test(name) ? 'xlsx' : 'other'), moveTo: t => { file.parent.files.splice(file.parent.files.indexOf(file), 1); t.files.push(file); file.parent = t; }};
    folderObj.files.push(file); files.set(id, file); return file;
  }
  const ctx = {
    TARGET_SPREADSHEET_ID: 'T', PROCESSED_FOLDER_ID: 'P', MimeType: {GOOGLE_SHEETS: 'sheets', MICROSOFT_EXCEL: 'xlsx'}, SOURCE_FOLDER_ID: 'S', Logger: {log: m => logs.push(String(m))}, Session: {getScriptTimeZone: () => 'Asia/Seoul'},
    PropertiesService: {getScriptProperties: () => ({setProperty: (k, v) => { props[k] = v; }, getProperty: k => (k in props ? props[k] : null), deleteProperty: k => { delete props[k]; }})},
    SpreadsheetApp: {openById: id => (id === 'T' ? ss : temps.get(id))},
    DriveApp: {getFileById: id => files.get(id) || {setTrashed: () => trashed.push(id)}, getFolderById: id => (id === 'P' ? processed : source)},
    // Apps Script 의 Drive.Files.create 는 동기 호출이라, 시험에서는 addBundle 이 미리 읽어 둔 시트를 돌려줌
    Drive: {Files: {create: (meta, b) => { const sheets = parsed.get(hash(b.data)); if (!sheets) throw new Error('변환 실패(시뮬레이션)'); const id = 'tmp' + temps.size; temps.set(id, {getSheets: () => sheets.map(sh => ({getDataRange: () => ({getValues: () => sh.rows})}))}); return {id}; }}},
    Utilities: {
      unzip: b => Object.entries(unzipSync(new Uint8Array(b.data))).map(([n, d]) => blob(n, Buffer.from(d))),
      ungzip: b => blob(b.getName(), zlib.gunzipSync(Buffer.from(b.data))), newBlob: (s, type, name) => blob(name, Buffer.from(s, 'utf8')), gzip: (b, name) => blob(name, zlib.gzipSync(Buffer.from(b.data))),
      formatDate: (d, tz, fmt) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    },
  };
  if (original) {
    delete ctx.TARGET_SPREADSHEET_ID; delete ctx.PROCESSED_FOLDER_ID; delete ctx.SOURCE_FOLDER_ID; // 실제 기존 코드의 const 로 대체
    ctx.LockService = {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})};
    ctx.ContentService = {MimeType: {JSON: 'json'}, createTextOutput: t => ({text: t, setMimeType() { return this; }})};
    ctx.ScriptApp = {getProjectTriggers: () => [], newTrigger: () => ({timeBased: () => ({after: () => ({create() {}}), everyMinutes: () => ({create() {}})})}), deleteTrigger() {}};
    ctx.Utilities.base64Encode = b => Buffer.from(b).toString('base64');
    ctx.MimeType.MICROSOFT_EXCEL = 'xlsx';
  }
  vm.createContext(ctx); vm.runInContext([original ? integratedSource() : ORIGINAL, read('SnapshotGuard.gs'), read('Batch.gs'), read('DryRun.gs')].join('\n'), ctx);
  const addBundle = async (name, buf) => { for (const d of Object.values(unzipSync(new Uint8Array(buf)))) { try { parsed.set(hash(d), await readSheets(Buffer.from(d))); } catch { /* 엑셀이 아님 → 변환 실패 */ } } return addFile(source, name, buf); };
  const addExcel = async (name, buf) => { try { parsed.set(hash(buf), await readSheets(Buffer.from(buf))); } catch { /* 읽을 수 없는 파일 → 변환 실패 */ } return addFile(source, name, Buffer.from(buf)); };
  const call = (fn, ...a) => vm.runInContext(fn, ctx)(...a);
  return {
    doGet: p => JSON.parse(call('doGet', {parameter: p}).text),
    logs, call, addBundle, addExcel, temps, ctx, tabs, mkSheet, source, processed, addFile, props, trashed,
    run: () => call('checkForNewFilesInner_'),
    snapshot: () => call('buildSnapshotChecked_'),
    problems: () => call('readProblems_'),
    // 저장본 파일 → 시트 이름별 2차원 배열 (대시보드가 받는 JSON)
    snapshotJson: () => { const id = props.SNAPSHOT_FILE_ID; return id ? JSON.parse(zlib.gunzipSync(files.get(id).bytes).toString('utf8')) : null; },
  };
}
export {zipSync};
