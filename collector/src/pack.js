// 수동 업로드 준비: ERP 에서 직접 내려받은 엑셀을 검사하고, 기존 이름 규칙으로 바꿔서, 드라이브 업로드 폴더에 올릴 파일을 만듭니다.
//   npm run pack -- "C:\Users\나\Downloads\erp"            → 같은 폴더 안 ERP_업로드_준비_날짜\ 에 만듦
// 5개(가용재고조회 · WMS창고재고관리(EMP) · 일자별판매실적분석 B2B1팀/B2B2팀 · 제품일정표)가 모두 있고 검사를 통과해야만 만듭니다 (전부 아니면 전무).
// 상품마스터는 다루지 않습니다. 드라이브 폴더에는 아무것도 쓰지 않습니다 (만든 파일을 직접 올립니다).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {zipSync} from 'fflate';
import {FILES, fileName} from './files.js';
import {validateAll} from './validate.js';
import {readSheets} from './xlsx.js';
import {teamFromRows, teamFromName} from '../../web/src/lib/parse.js';

const nfc = s => String(s).normalize('NFC');
/** 파일 이름 → 어떤 파일인지 (날짜 · (1) · '팀' 유무가 달라도 알아봄) */
export function classify(name) {
  const n = nfc(name);
  if (/상품마스터/.test(n)) return {kind: 'skip', why: '상품마스터는 이 도구가 다루지 않습니다 (기존 방식 그대로)'};
  if (/가용재고조회/.test(n)) return {kind: 'file', id: 'inventory'};
  if (/WMS\s*창고재고관리/i.test(n)) return {kind: 'file', id: 'wms'};
  if (/제품일정표/.test(n)) return {kind: 'file', id: 'schedule'};
  if (/일자별판매실적분석/.test(n)) { const m = n.match(/B2B\s*([12])/i); return {kind: 'file', id: 'sales', team: m ? `B2B${m[1]}팀` : null}; }
  return {kind: 'skip', why: '알 수 없는 파일 이름'};
}

export async function packFolder({dir, out, now = new Date(), defs = FILES}) {
  const errors = [], notes = [];
  const found = new Map(); // id → [{name, mtime, buf}]
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.xlsx$/i.test(name) || name.startsWith('~$') || /^ERP_BUNDLE_/.test(name)) continue;
    const c = classify(name);
    if (c.kind === 'skip') { notes.push(`건너뜀: ${name} — ${c.why}`); continue; }
    const full = path.join(dir, name), buf = fs.readFileSync(full);
    let id = c.id;
    if (id === 'sales') {
      let team = c.team;
      if (!team) { try { const s = await readSheets(buf); team = teamFromRows(s[0]?.rows || []); if (team) notes.push(`${name}: 파일 이름에 팀이 없어 '부서' 열로 ${team} 로 판단`); } catch { /* 아래 검사에서 오류로 나옴 */ } }
      if (!team) { errors.push(`${name}: B2B1팀 · B2B2팀 중 어느 팀인지 알 수 없습니다 (파일 이름에 B2B1 또는 B2B2 를 넣어 주세요)`); continue; }
      id = team === 'B2B1팀' ? 'sales1' : 'sales2';
    }
    if (!found.has(id)) found.set(id, []);
    found.get(id).push({name, mtime: fs.statSync(full).mtimeMs, buf});
  }
  const chosen = new Map();
  for (const d of defs) {
    const list = (found.get(d.id) || []).sort((a, b) => b.mtime - a.mtime);
    if (!list.length) { errors.push(`${fileName(d, now)} 에 해당하는 파일이 없습니다`); continue; }
    chosen.set(d.id, list[0].buf);
    notes.push(`사용: ${list[0].name} → ${fileName(d, now)}`);
    list.slice(1).forEach(x => notes.push(`무시: ${x.name} (같은 종류의 더 최신 파일이 있음)`));
  }
  if (!errors.length) {
    try { const r = await validateAll(defs, chosen); notes.push('검사 통과: ' + defs.map(d => `${d.id} ${r.rows[d.id]}행`).join(', ')); }
    catch (e) { errors.push(...e.message.split(' / ')); }
  }
  if (errors.length) return {ok: false, errors, notes};
  const files = Object.fromEntries(defs.map(d => [fileName(d, now), new Uint8Array(chosen.get(d.id))]));
  fs.mkdirSync(out, {recursive: true});
  for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(out, n), b);
  const stamp = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const bundle = `ERP_BUNDLE_${stamp}.zip`;
  fs.writeFileSync(path.join(out, bundle), zipSync(files, {level: 0}));
  return {ok: true, errors, notes, out, bundle, files: Object.keys(files)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) { console.log('사용: npm run pack -- "엑셀을 내려받은 폴더"'); process.exit(1); }
  const now = new Date();
  const out = path.join(dir, `ERP_업로드_준비_${new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)}`);
  const r = await packFolder({dir, out, now});
  r.notes.forEach(n => console.log(n));
  if (!r.ok) { console.log('\n업로드 파일을 만들지 않았습니다. 아래를 고친 뒤 다시 실행하세요:'); r.errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
  console.log(`\n준비 완료: ${r.out}\n  개별 파일 5개(현재 방식): 이 폴더의 .xlsx 5개를 드라이브 '업로드용' 폴더에 올리세요.\n  묶음(zip, Apps Script 에 묶음 처리 코드를 적용한 뒤): ${r.bundle} 1개만 올리세요 (전부 아니면 전무로 반영).`);
}
