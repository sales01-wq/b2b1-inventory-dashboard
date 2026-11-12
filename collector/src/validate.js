import crypto from 'node:crypto';
import XLSX from 'xlsx';
import {detectSheetType, teamFromRows, findHeaderRow, SHEET_SIGNATURES} from '../../web/src/lib/parse.js'; // 대시보드와 같은 시트 인식 규칙

export const MIN_RATIO = 0.5; // 직전보다 행이 절반 아래로 줄면 이상으로 봄
const BIG = 20; // 행이 이만큼 이상일 때만 비교 (처음이거나 작은 파일은 건너뜀)

/** 엑셀 1개 검사. 통과하면 {rows, hash}, 아니면 Error */
export function validateFile(def, buf, prevRows) {
  let wb;
  try { wb = XLSX.read(buf, {type: 'buffer'}); } catch (e) { throw new Error(`${def.id}: 엑셀을 읽을 수 없음 (${e.message})`); }
  if (wb.SheetNames.length !== 1) throw new Error(`${def.id}: 시트가 ${wb.SheetNames.length}개 (1개여야 기존 탭 이름이 유지됨)`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: false, defval: ''});
  const type = detectSheetType(rows);
  if (type !== def.type) throw new Error(`${def.id}: 시트 종류가 ${type || '인식 안 됨'} (기대: ${def.type})`);
  const sig = SHEET_SIGNATURES.find(s => s.key === type);
  const head = findHeaderRow(rows, sig.must);
  const n = rows.length - head.idx - 1;
  if (n < 1) throw new Error(`${def.id}: 데이터 행이 없음`);
  if (def.team) { const t = teamFromRows(rows); if (t && t !== def.team) throw new Error(`${def.id}: 팀이 ${t} (기대: ${def.team})`); }
  if (prevRows >= BIG && n < prevRows * MIN_RATIO) throw new Error(`${def.id}: 행 수가 ${prevRows} → ${n} 로 급감`);
  return {rows: n, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}

/** 전체 묶음 검사: 5개가 모두 있고 모두 통과해야 함 (전부 아니면 전무) */
export function validateAll(defs, buffers, prevRows = {}) {
  const errs = [], res = {};
  for (const d of defs) {
    const buf = buffers.get(d.id);
    if (!buf) { errs.push(`${d.id}: 파일을 받지 못함`); continue; }
    try { res[d.id] = validateFile(d, buf, prevRows[d.id]); } catch (e) { errs.push(e.message); }
  }
  if (errs.length) throw new Error(errs.join(' / '));
  const hash = crypto.createHash('sha256').update(defs.map(d => res[d.id].hash).join('|')).digest('hex');
  return {hash, rows: Object.fromEntries(defs.map(d => [d.id, res[d.id].rows]))};
}
