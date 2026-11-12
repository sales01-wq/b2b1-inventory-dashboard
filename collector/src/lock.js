import fs from 'node:fs';

const STALE_MS = 30 * 60 * 1000; // 30분 넘은 잠금은 죽은 실행으로 보고 무시

/** 겹쳐 실행 방지. 잠겨 있으면 null, 아니면 해제 함수 */
export function acquire(file, now = Date.now()) {
  try {
    const fd = fs.openSync(file, 'wx'); // 이미 있으면 실패 (원자적)
    fs.writeSync(fd, JSON.stringify({pid: process.pid, at: now})); fs.closeSync(fd);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let at = 0; try { at = JSON.parse(fs.readFileSync(file, 'utf8')).at; } catch { /* 깨진 잠금 */ }
    if (now - at < STALE_MS) return null;
    fs.rmSync(file, {force: true});
    return acquire(file, now);
  }
  return () => fs.rmSync(file, {force: true});
}
