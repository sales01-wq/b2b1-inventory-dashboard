// 자동 로그인 안전장치: 비밀번호가 틀렸는데 30분마다 계속 시도하면 계정이 잠길 수 있으므로, 연속 실패가 MAX 번이면 자동 로그인을 멈춤.
import fs from 'node:fs';
import path from 'node:path';

const MAX = 2;
export class AuthStop extends Error {}

export function authGuard(workDir) {
  const file = path.join(workDir, 'auth-state.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {failures: 0}; } };
  const write = o => { fs.mkdirSync(workDir, {recursive: true}); fs.writeFileSync(file, JSON.stringify(o)); };
  return {
    /** 로그인 정보를 실제로 제출하기 직전에 부름. 먼저 횟수를 적어 두므로 도중에 죽어도 센다 */
    beforeAttempt() {
      const s = read();
      if (s.failures >= MAX) throw new AuthStop(`자동 로그인 중단: 연속 ${s.failures}회 실패 (계정 잠금 방지). 아이디 · 비밀번호 · ERP 상태를 확인한 뒤 'npm run reset-login' 으로 다시 켜세요`);
      write({failures: s.failures + 1, lastAt: Date.now()});
    },
    success() { write({failures: 0, lastOkAt: Date.now()}); },
    reset() { write({failures: 0}); },
    state: read,
  };
}
