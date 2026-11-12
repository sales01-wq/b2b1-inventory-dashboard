/**
 * 읽기 전용 점검 — 운영 시트 · 저장본 · 폴더 · 속성을 바꾸지 않습니다. Apps Script 편집기에서 함수를 골라 ▶ 실행하고 '실행 로그'를 보세요.
 * 어떤 트리거도 이 함수들을 부르지 않으므로, 이 파일을 추가해도 기존 동작은 달라지지 않습니다 (Batch.gs · SnapshotGuard.gs 와 같이 추가).
 *
 *  dryRunReport()          : 지금 시트의 탭 목록(이름 · 행 수 · 시트 종류), 상품마스터 탭, 같은 종류 탭이 여러 개인지
 *  dryRunSnapshot()        : 지금 시트로 저장본을 만든다면 검사를 통과하는지 (저장본은 만들지 않음)
 *  dryRunBatch()           : 지금 업로드 폴더에 있는 파일들이 한 묶음으로 처리 가능한지 (파일 이동 · 시트 변경 없음)
 *  dryRunBundle('파일ID')  : pack 이 만든 ERP_BUNDLE zip(감시 폴더 밖 아무 곳에 올려 두고 그 파일 ID)이 처리 가능한지. 대상 시트는 바꾸지 않음
 *                            (변환용 임시 시트만 만들었다가 휴지통으로 보냄)
 */
function dryRunReport() {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const byType = {}, lines = [];
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName(), rows = sh.getLastRow();
    if (name.indexOf('__') === 0) { lines.push('  (숨은 탭) ' + name); return; }
    const head = rows ? sh.getRange(1, 1, Math.min(12, rows), Math.max(1, sh.getLastColumn())).getValues() : [];
    const type = sheetTypeOf_(head) || '인식 안 됨';
    (byType[type] = byType[type] || []).push(name);
    lines.push('  ' + name + ' — 행 ' + rows + ', 종류 ' + type + (BUNDLE_PROTECTED_TABS.test(name) ? '  [상품마스터: 수집 묶음이 건드리지 않음]' : ''));
  });
  Logger.log('탭 목록:\n' + lines.join('\n'));
  const warn = [];
  ['inventory', 'schedule', 'expiry', 'productMaster'].forEach(function (t) { if ((byType[t] || []).length > 1) warn.push('같은 종류(' + t + ') 탭이 ' + byType[t].length + '개: ' + byType[t].join(', ') + ' — 대시보드는 마지막 하나만 씁니다'); });
  if ((byType.sales || []).length > 2) warn.push('판매실적 탭이 ' + byType.sales.length + '개: ' + byType.sales.join(', ') + ' — 팀별 1개씩(B2B1팀 · B2B2팀)이어야 합니다');
  ['inventory', 'sales'].forEach(function (t) { if (!(byType[t] || []).length) warn.push('필수 종류(' + t + ') 탭이 없습니다'); });
  if (!(byType.productMaster || []).length) warn.push('상품마스터 탭이 없습니다');
  const info = getSnapshotInfo_(), lu = PropertiesService.getScriptProperties().getProperty('LAST_UPDATE');
  Logger.log('저장본: ' + (info ? new Date(info.at).toISOString() : '없음') + ' / 마지막 업데이트: ' + (lu || '없음'));
  Logger.log(warn.length ? '주의:\n - ' + warn.join('\n - ') : '주의할 점 없음');
}

function dryRunSnapshot() {
  const out = readSheetsForSnapshot_();
  const problem = validateSnapshotOut_(out, prevInfo_());
  Logger.log('지금 시트의 통계: ' + JSON.stringify(snapshotStats_(out).rows));
  Logger.log(problem ? '저장본을 만들면 거부됩니다: ' + problem : '저장본 검사 통과 (이 점검은 저장본을 만들지 않았습니다)');
}

function dryRunBundle(fileId) {
  const temps = [];
  try {
    const staged = readBundle_(DriveApp.getFileById(fileId), temps);
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    staged.forEach(function (s) { Logger.log('  ' + s.target + ' ← 종류 ' + s.type + ', 데이터 행 ' + dataRows_(s.data) + (ss.getSheetByName(s.target) ? ' (기존 탭을 교체)' : ' (새 탭)')); });
    Logger.log('묶음 검사 통과: ' + staged.length + '개 탭 (대상 시트는 바꾸지 않았습니다)');
  } catch (err) {
    Logger.log('묶음이 거부됩니다: ' + err.message);
  } finally {
    temps.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  }
}

function dryRunBatch() {
  const temps = [];
  try {
    const r = stageFolder_(DriveApp.getFolderById(SOURCE_FOLDER_ID), temps);
    Logger.log('폴더의 파일 ' + r.sources.length + '개: ' + r.sources.map(function (f) { return f.getName(); }).join(', '));
    r.staged.forEach(function (s) { Logger.log('  ' + s.source + ' → 탭 ' + s.target + ' (종류 ' + s.type + ', 데이터 행 ' + dataRows_(s.data) + ')'); });
    Logger.log(r.problems.length ? '이 묶음은 거부됩니다 (시트 · 파일은 그대로):\n - ' + r.problems.map(function (p) { return p.file + ': ' + p.msg; }).join('\n - ') : (r.sources.length ? '묶음 검사 통과 (이 점검은 아무것도 바꾸지 않았습니다)' : '처리할 파일이 없습니다'));
  } finally { temps.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }); }
}
