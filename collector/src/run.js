// ERP 수집기: 받기 → 전부 검사 → 바뀐 게 있을 때만 → 묶음(zip) 1개를 업로드 폴더에 올림.
// 묶음 1개는 Drive 에 한 번에 나타나므로, Apps Script 가 일부만 처리하는 일이 없음.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import AdmZip from 'adm-zip';
import {FILES, NEVER, fileName, ymd} from './files.js';
import {validateAll} from './validate.js';
import {acquire} from './lock.js';

const expand = p => String(p).replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
const stamp = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

export function loadConfig(file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'config.json')) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {...c, workDir: expand(c.workDir || path.join(os.homedir(), 'erp-collector'))};
}

/** 한 번 실행. adapter.fetchAll(defs, date) → Map(id → Buffer). 반환: {result, ...} */
export async function runOnce({config, adapter, now = new Date(), log = () => {}}) {
  const work = config.workDir;
  fs.mkdirSync(work, {recursive: true});
  const statePath = path.join(work, 'state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
  const defs = config.files || FILES;
  if (defs.some(d => NEVER.some(n => fileName(d, now).includes(n)))) throw new Error('상품마스터는 수집 대상이 아닙니다');

  const release = acquire(path.join(work, 'run.lock'), now.getTime());
  if (!release) { log('이미 실행 중이라 건너뜀'); return {result: 'busy'}; }
  try {
    state.lastRunAt = now.getTime();
    // 1) 업로드 폴더 상태 확인: 앞선 묶음이 아직 처리 전이면 쌓지 않음, Apps Script 가 거부한 묶음이 있으면 다시 올릴 수 있게 함
    const names = fs.readdirSync(config.uploadFolder);
    const failed = names.filter(n => /^FAILED_ERP_BUNDLE_.*\.zip$/i.test(n));
    if (failed.length) {
      fs.mkdirSync(path.join(work, 'failed'), {recursive: true});
      failed.forEach(n => fs.renameSync(path.join(config.uploadFolder, n), path.join(work, 'failed', n)));
      state.lastHash = null; state.lastError = {at: now.getTime(), msg: `Apps Script 가 묶음을 거부함: ${failed.join(', ')} (work/failed 에 보관)`};
      save(); log(state.lastError.msg);
    }
    if (names.some(n => /^ERP_BUNDLE_.*\.zip(\.tmp)?$/i.test(n))) {
      state.lastCheckedAt = now.getTime(); save(); log('이전 묶음이 아직 처리 대기 중이라 이번에는 올리지 않음');
      return {result: 'pending'};
    }
    // 2) 받기 + 전부 검사
    let checked;
    const buffers = await adapter.fetchAll(defs, now);
    try { checked = validateAll(defs, buffers, state.rows); }
    catch (e) { state.lastError = {at: now.getTime(), msg: e.message}; state.lastCheckedAt = now.getTime(); save(); log('검사 실패: ' + e.message); return {result: 'invalid', error: e.message}; }
    state.lastCheckedAt = now.getTime();
    // 3) 바뀐 게 없으면 올리지 않음
    if (checked.hash === state.lastHash) { delete state.lastError; save(); log('변경 없음'); return {result: 'unchanged'}; }
    // 4) 묶음 1개로 올림: 임시 이름으로 쓰고 다 쓴 뒤 이름 변경 (쓰는 도중에는 Apps Script 가 보지 못함)
    const zip = new AdmZip();
    defs.forEach(d => zip.addFile(fileName(d, now), buffers.get(d.id)));
    const name = `ERP_BUNDLE_${stamp(now)}_${checked.hash.slice(0, 8)}.zip`;
    const tmp = path.join(config.uploadFolder, name + '.tmp');
    try { fs.writeFileSync(tmp, zip.toBuffer()); fs.renameSync(tmp, path.join(config.uploadFolder, name)); }
    catch (e) { fs.rmSync(tmp, {force: true}); throw e; }
    Object.assign(state, {lastHash: checked.hash, rows: checked.rows, lastSuccessAt: now.getTime(), lastBundle: name}); delete state.lastError; save();
    log('업로드 완료: ' + name);
    return {result: 'published', bundle: name};
  } catch (e) {
    state.lastError = {at: now.getTime(), msg: e.message}; save(); log('오류: ' + e.message);
    return {result: 'error', error: e.message};
  } finally { release(); }
}

// 직접 실행: node src/run.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const log = m => { const line = `${new Date().toISOString()} ${m}`; console.log(line); try { fs.appendFileSync(path.join(config.workDir, 'run.log'), line + '\n'); } catch { /* 로그 실패는 무시 */ } };
  const adapter = (await import(`./adapters/${config.adapter || 'erp'}.js`)).default(config);
  const r = await runOnce({config, adapter, log});
  process.exitCode = ['error', 'invalid'].includes(r.result) ? 1 : 0;
}
