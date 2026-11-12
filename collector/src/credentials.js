// ERP 계정 저장 · 읽기: Windows DPAPI (PowerShell 의 Export-Clixml / Import-Clixml). 이 Windows 사용자 + 이 PC 에서만 복호화됨.
// 비밀번호는 명령줄 인수나 파일에 평문으로 넘기지 않고 PowerShell 의 표준 입력(stdin, base64)으로만 전달함.
// 'powershell -Command' 는 스크립트 파일이 아니라서 회사의 PowerShell 실행 정책(.ps1 차단)에 걸리지 않으며, 정책은 건드리지 않음.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const credFile = workDir => path.join(workDir, 'erp-cred.xml');
const q = s => `'${String(s).replace(/'/g, "''")}'`; // PowerShell 작은따옴표 문자열

export function runPowerShell(script, input = '') {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {input, encoding: 'utf8', windowsHide: true});
  if (r.error) throw new Error('PowerShell 을 실행할 수 없습니다: ' + r.error.message);
  if (r.status !== 0) throw new Error('PowerShell 오류: ' + String(r.stderr || '').trim().split('\n')[0]);
  return r.stdout;
}

export function saveCredential(workDir, {user, password}, run = runPowerShell) {
  if (!user || !password) throw new Error('아이디와 비밀번호가 필요합니다');
  fs.mkdirSync(workDir, {recursive: true});
  const script = `$ErrorActionPreference='Stop'; ` +
    `$j=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())) | ConvertFrom-Json; ` +
    `$s=ConvertTo-SecureString $j.password -AsPlainText -Force; ` +
    `New-Object System.Management.Automation.PSCredential($j.user,$s) | Export-Clixml -Path ${q(credFile(workDir))}`;
  run(script, Buffer.from(JSON.stringify({user, password}), 'utf8').toString('base64'));
}

/** 출력은 base64(UTF-8) 로 받음: 한글 계정이 콘솔 코드페이지에서 깨지지 않게 */
export function loadCredential(workDir, run = runPowerShell) {
  const script = `$ErrorActionPreference='Stop'; $c=Import-Clixml -Path ${q(credFile(workDir))}; $n=$c.GetNetworkCredential(); ` +
    `$o=@{user=$n.UserName;password=$n.Password} | ConvertTo-Json -Compress; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($o))`;
  return JSON.parse(Buffer.from(run(script).trim(), 'base64').toString('utf8'));
}

/** 입력한 글자를 화면에 보여 주지 않고 한 줄 읽기 (터미널에서만) */
export function readHidden(question, {stdin = process.stdin, stdout = process.stdout} = {}) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdin.setRawMode) return reject(new Error('비밀번호는 PowerShell 창에서 직접 입력해야 합니다 (파이프 · 리다이렉트 · 파일로는 받지 않음)'));
    stdout.write(question);
    let buf = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const finish = (fn, v) => { stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); fn(v); };
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish(resolve, buf);
        if (ch === '\u0003') return finish(reject, new Error('취소했습니다'));
        if (ch === '\b' || ch === '\x7f') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch; // 제어 문자는 무시, 화면에는 아무것도 출력하지 않음 (길이도 노출 안 함)
      }
    };
    stdin.on('data', onData);
  });
}

/** 입력 → 확인 → 저장 → 읽어서 확인. ask / askSecret / run 은 시험에서 바꿔 끼움 */
export async function setCredentials({workDir, ask, askSecret, run = runPowerShell, log = console.log}) {
  const user = (await ask('ERP 아이디: ')).trim();
  const password = await askSecret('ERP 비밀번호 (입력해도 화면에 안 보임): ');
  const again = await askSecret('비밀번호 한 번 더: ');
  if (!user || !password) throw new Error('아이디와 비밀번호를 모두 입력해야 합니다');
  if (password !== again) throw new Error('비밀번호가 서로 다릅니다. 저장하지 않았습니다');
  saveCredential(workDir, {user, password}, run);
  if (loadCredential(workDir, run).user !== user) throw new Error('저장 후 확인에 실패했습니다');
  log(`저장 완료: ${credFile(workDir)} (사용자 ${user}). 이 Windows 사용자 + 이 PC 에서만 복호화됩니다. 비밀번호는 어디에도 평문으로 남지 않았습니다.`);
}
