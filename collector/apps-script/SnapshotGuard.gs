/**
 * 저장본(스냅샷) 검증 + 문제 보고 — 기존 Apps Script 에 "추가"하는 코드입니다 (먼저 복사본에서 시험하세요).
 *
 * 기존 buildSnapshot_ 은 시트를 읽은 그대로 저장본으로 만들어서, 잘못된 업로드(빈 탭, 엉뚱한 내용, 마스터 누락)가 곧바로 모두에게 보입니다.
 * buildSnapshotChecked_ 는 같은 방식으로 만들되, 먼저 검사하고 통과할 때만 저장본을 바꿉니다. 실패하면 이전 저장본이 그대로 남고 문제가 기록됩니다.
 *
 * 기존 코드 수정은 buildSnapshot_() 호출 2곳을 buildSnapshotChecked_() 로 바꾸고(checkForNewFiles, runSnapshotJob),
 * doGet 의 action === 'bundle' 에서 out 을 만든 직후에 한 줄(out.problem = readProblems_();)을 넣는 것뿐입니다.
 */
// web/src/lib/parse.js 의 SHEET_SIGNATURES 와 같은 규칙 (같은 순서로 검사)
const SNAP_SIGS_ = [
  ['inventory', ['창고', '품번', '품명', '바코드']],
  ['schedule', ['품번', '거래처', '바코드', /^\d{1,2}월\s*입고일정$/]],
  ['sales', ['실적번호', '거래처', '품번', '수량']],
  ['expiry', ['상품코드', 'LOT', '유통기한', '가용재고수량']],
  ['productMaster', ['상품코드', '아웃무게g', '인무게g', '제품무게g']],
];
const SNAP_REQUIRED_ = ['inventory', 'sales'];      // 앱이 필수로 보는 종류
const SNAP_MIN_RATIO_ = 0.5, SNAP_BIG_ = 20;        // 직전보다 행이 절반 아래로 줄면 이상 (20행 이상일 때만 비교)

function headerIdx_(rows, must) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = (rows[i] || []).map(function (c) { return String(c === null || c === undefined ? '' : c).trim(); });
    const ok = must.every(function (m) { return m instanceof RegExp ? row.some(function (c) { return m.test(c); }) : row.indexOf(m) >= 0; });
    if (ok) return i;
  }
  return -1;
}
function sheetTypeOf_(rows) {
  for (let k = 0; k < SNAP_SIGS_.length; k++) if (headerIdx_(rows, SNAP_SIGS_[k][1]) >= 0) return SNAP_SIGS_[k][0];
  return null;
}
function dataRows_(rows) {
  const t = sheetTypeOf_(rows); if (!t) return 0;
  const sig = SNAP_SIGS_.filter(function (s) { return s[0] === t; })[0][1];
  return rows.length - headerIdx_(rows, sig) - 1;
}
function snapshotStats_(out) {
  const rows = {};
  Object.keys(out).forEach(function (name) { const t = sheetTypeOf_(out[name]); if (t) rows[t] = (rows[t] || 0) + Math.max(0, dataRows_(out[name])); });
  return { rows: rows };
}
/** 문제가 있으면 이유(글자), 없으면 '' */
function validateSnapshotOut_(out, prev) {
  const st = snapshotStats_(out).rows;
  const missing = SNAP_REQUIRED_.filter(function (t) { return !st[t]; });
  if (missing.length) return '필수 시트 내용이 없거나 인식되지 않음: ' + missing.join(', ');
  const before = prev && prev.stats && prev.stats.rows;
  if (before) {
    if (before.productMaster && !st.productMaster) return '상품마스터가 저장본에서 빠짐 (이전 저장본에는 있었음)';
    const drop = Object.keys(before).filter(function (t) { return before[t] >= SNAP_BIG_ && (st[t] || 0) < before[t] * SNAP_MIN_RATIO_; });
    if (drop.length) return '행 수가 급감함: ' + drop.map(function (t) { return t + ' ' + before[t] + ' → ' + (st[t] || 0); }).join(', ');
  }
  return '';
}

/** buildSnapshot_ 과 같은 저장본을 만들되, 검사를 통과할 때만 교체. 반환: true(교체함) / false(이전 저장본 유지) */
function buildSnapshotChecked_() {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const tz = Session.getScriptTimeZone();
  const out = {};
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (name.indexOf('__') === 0) return;
    if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) return;
    out[name] = sh.getDataRange().getValues().map(function (row) {
      return row.map(function (c) {
        if (Object.prototype.toString.call(c) === '[object Date]') return Utilities.formatDate(c, tz, 'yyyy-MM-dd');
        return c;
      });
    });
  });
  const props = PropertiesService.getScriptProperties();
  const problem = validateSnapshotOut_(out, getSnapshotInfo_());
  if (problem) {
    props.setProperty('SNAPSHOT_PROBLEM', JSON.stringify({ at: new Date().getTime(), msg: problem }));
    Logger.log('저장본을 바꾸지 않음: ' + problem);
    return false;
  }
  const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(out), 'application/json', 'snapshot.json'), '__snapshot.json.gz');
  const oldId = props.getProperty('SNAPSHOT_FILE_ID');
  const file = DriveApp.getFolderById(PROCESSED_FOLDER_ID).createFile(gz);
  props.setProperty('SNAPSHOT_FILE_ID', file.getId());
  props.setProperty('SNAPSHOT_INFO', JSON.stringify({ at: new Date().getTime(), size: file.getSize(), stats: snapshotStats_(out) }));
  props.deleteProperty('SNAPSHOT_PROBLEM');
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {} }   // 새 저장본을 확정한 뒤에 옛 파일 정리
  Logger.log('저장본 생성 완료 (' + file.getSize() + ' bytes)');
  return true;
}

/** 대시보드에 알려 줄 최근 문제 (없으면 null). bundle 응답의 problem 필드 */
function readProblems_() {
  const props = PropertiesService.getScriptProperties();
  const p = function (k) { try { return JSON.parse(props.getProperty(k) || 'null'); } catch (e) { return null; } };
  const bundle = p('BUNDLE_ERROR'), snapshot = p('SNAPSHOT_PROBLEM');
  return (bundle || snapshot) ? { bundle: bundle, snapshot: snapshot } : null;
}
