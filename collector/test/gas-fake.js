// Apps Script 추가 코드(ErpBundle.gs · SnapshotGuard.gs)를 가짜 Drive · 시트 · 속성 객체 위에서 실행하는 시험 도구
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
function getSnapshotInfo_() { const raw = PropertiesService.getScriptProperties().getProperty('SNAPSHOT_INFO'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }`;

export function world({failWriteOn} = {}) {
  const tabs = new Map(); // 대상 스프레드시트: 이름 → 시트
  const props = {}, trashed = [], temps = new Map(), parsed = new Map(), files = new Map();
  const hash = b => crypto.createHash('sha1').update(Buffer.from(b)).digest('hex');
  const mkSheet = (name, data = []) => {
    const sh = {name, data, getName: () => sh.name, setName: n => { tabs.delete(sh.name); sh.name = n; tabs.set(n, sh); }, clear: () => { sh.data = []; },
      getDataRange: () => ({getValues: () => sh.data}), getLastRow: () => sh.data.length, getLastColumn: () => (sh.data[0] || []).length,
      getRange: () => ({setValues: v => { if (failWriteOn && sh.name === failWriteOn) throw new Error('쓰기 실패(시뮬레이션)'); sh.data = v; }})};
    tabs.set(name, sh); return sh;
  };
  const ss = {getSheetByName: n => tabs.get(n) || null, insertSheet: n => mkSheet(n), deleteSheet: sh => tabs.delete(sh.name), getSheets: () => [...tabs.values()]};
  const blob = (name, bytes) => ({getName: () => name, getBytes: () => bytes, data: bytes, setContentType() { return this; }});
  const folder = () => { const list = []; return {files: list, getFiles: () => { let i = 0; return {hasNext: () => i < list.length, next: () => list[i++]}; }, createFile: b => addFile(f2, b.getName(), Buffer.from(b.data))}; };
  const source = folder(), processed = folder();
  let f2 = processed; // createFile 은 처리완료 폴더에 만든다
  let seq = 0;
  function addFile(folderObj, name, bytes) {
    const id = 'f' + ++seq;
    const file = {id, name, bytes, parent: folderObj, getId: () => id, getSize: () => bytes.length, getName: () => file.name, setName: n => { file.name = n; }, setTrashed: v => { if (v) trashed.push(id); }, getBlob: () => blob(file.name, file.bytes),
      moveTo: t => { file.parent.files.splice(file.parent.files.indexOf(file), 1); t.files.push(file); file.parent = t; }};
    folderObj.files.push(file); files.set(id, file); return file;
  }
  const ctx = {
    TARGET_SPREADSHEET_ID: 'T', PROCESSED_FOLDER_ID: 'P', MimeType: {GOOGLE_SHEETS: 'sheets'}, Logger: {log() {}}, Session: {getScriptTimeZone: () => 'Asia/Seoul'},
    PropertiesService: {getScriptProperties: () => ({setProperty: (k, v) => { props[k] = v; }, getProperty: k => (k in props ? props[k] : null), deleteProperty: k => { delete props[k]; }})},
    SpreadsheetApp: {openById: id => (id === 'T' ? ss : temps.get(id))},
    DriveApp: {getFileById: id => files.get(id) || {setTrashed: () => trashed.push(id)}, getFolderById: id => (id === 'P' ? processed : source)},
    // Apps Script 의 Drive.Files.create 는 동기 호출이라, 시험에서는 addBundle 이 미리 읽어 둔 시트를 돌려줌
    Drive: {Files: {create: (meta, b) => { const sheets = parsed.get(hash(b.data)); if (!sheets) throw new Error('변환 실패(시뮬레이션)'); const id = 'tmp' + temps.size; temps.set(id, {getSheets: () => sheets.map(sh => ({getDataRange: () => ({getValues: () => sh.rows})}))}); return {id}; }}},
    Utilities: {
      unzip: b => Object.entries(unzipSync(new Uint8Array(b.data))).map(([n, d]) => blob(n, Buffer.from(d))),
      newBlob: (s, type, name) => blob(name, Buffer.from(s, 'utf8')), gzip: (b, name) => blob(name, zlib.gzipSync(Buffer.from(b.data))),
      formatDate: (d, tz, fmt) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    },
  };
  vm.createContext(ctx); vm.runInContext([ORIGINAL, read('SnapshotGuard.gs'), read('ErpBundle.gs')].join('\n'), ctx);
  const addBundle = async (name, buf) => { for (const d of Object.values(unzipSync(new Uint8Array(buf)))) { try { parsed.set(hash(d), await readSheets(Buffer.from(d))); } catch { /* 엑셀이 아님 → 변환 실패 */ } } return addFile(source, name, buf); };
  const call = (fn, ...a) => vm.runInContext(fn, ctx)(...a);
  return {
    addBundle, temps, ctx, tabs, mkSheet, source, processed, addFile, props, trashed,
    run: () => call('processErpBundles_', source, processed),
    snapshot: () => call('buildSnapshotChecked_'),
    problems: () => call('readProblems_'),
    // 저장본 파일 → 시트 이름별 2차원 배열 (대시보드가 받는 JSON)
    snapshotJson: () => { const id = props.SNAPSHOT_FILE_ID; return id ? JSON.parse(zlib.gunzipSync(files.get(id).bytes).toString('utf8')) : null; },
  };
}
export {zipSync};
