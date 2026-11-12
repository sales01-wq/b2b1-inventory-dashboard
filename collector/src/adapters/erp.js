// 실제 영림원 ERP 수집 (Playwright). 아직 ERP 화면을 조사하기 전이라 뼈대만 있습니다 — 승인 후 PC 에서 작성.
// 규칙: 읽기 전용 계정, 자격증명은 Windows 암호화 저장소(set-credentials.ps1)에서만 읽음, 화면 이동은 조회·내보내기만.
import {execFileSync} from 'node:child_process';
import path from 'node:path';

/** set-credentials.ps1 로 저장한 계정을 읽음 (이 Windows 사용자 + 이 PC 에서만 복호화 가능) */
export function loadCredential(workDir) {
  const file = path.join(workDir, 'erp-cred.xml');
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `$c = Import-Clixml -Path '${file}'; $n = $c.GetNetworkCredential(); @{user=$n.UserName; password=$n.Password} | ConvertTo-Json -Compress`], {encoding: 'utf8'});
  return JSON.parse(out);
}

export default function erp(config) {
  return {
    async fetchAll(defs) {
      // TODO(승인 후): const {chromium} = await import('playwright');
      //   persistent context (workDir/browser-profile) → 로그인(loadCredential) → defs 마다 해당 메뉴에서 조회 → 엑셀 내보내기 다운로드
      //   → Map(def.id → Buffer) 반환. 실패하면 throw (일부만 반환하지 말 것: 검사 단계가 전부 아니면 전무로 막음)
      throw new Error('ERP 수집은 아직 구현되지 않았습니다 (ERP 화면 조사 필요)');
    },
  };
}
