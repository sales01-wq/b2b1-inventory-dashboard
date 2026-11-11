/**
 * 미리보기 모드 (빌드할 때 VITE_DEMO_DATA=1 일 때만 켜짐, 운영 빌드에는 영향 없음).
 * - 로그인 · 공유 데이터 연결을 건너뛰고, 테스트와 같은 가짜 ERP 시트(src/lib/__fixtures__/sheets.js)를 업로드와 같은 경로로 적용
 * - 브라우저의 모든 네트워크 요청(fetch)을 막아서 실제 데이터(구글 Apps Script · /api)에 닿을 수 없음
 * - 새로고침 · 지금 가져오기 버튼은 테스트 데이터를 다시 적용
 */
import {emit} from '../lib/store.js';
import {applyUploadedData, unresolvedFiles} from '../lib/upload.js';
import {detectSheetType} from '../lib/parse.js';

export const DEMO = import.meta.env.VITE_DEMO_DATA === '1';

export async function loadDemoData() {
  const {makeSheets} = await import('../lib/__fixtures__/sheets.js');
  const sh = makeSheets(Date.now());
  const files: Record<string, string[][]> = {가용재고: sh.inventory, 제품일정표: sh.schedule, 판매실적: sh.sales1, 판매실적_B2B2팀: sh.sales2, 유통기한: sh.expiry, 상품마스터: sh.productMaster};
  unresolvedFiles.length = 0;
  for (const [name, rows] of Object.entries(files)) unresolvedFiles.push({fileName: name + '.csv', rows, key: detectSheetType(rows)});
  emit({applied: applyUploadedData('upload')});
}

/** 시작할 때 한 번: 네트워크 차단 + 테스트 데이터 적용 */
export function startDemo() {
  window.fetch = () => Promise.reject(new Error('미리보기 모드: 네트워크 요청이 차단되어 있습니다 (테스트 데이터만 사용).'));
  void loadDemoData();
}
