/**
 * ============================================================
 *  구글드라이브 폴더 자동 감시 → 스프레드시트 자동 업데이트
 * ============================================================
 *
 * 하는 일:
 *  1. "업로드용" 폴더에 새 엑셀(.xlsx) 파일이 들어오는지 5분마다 확인
 *  2. 새 파일을 발견하면, 그 파일을 임시 구글시트로 변환
 *  3. 임시 시트 안의 각 탭(가용재고조회, 제품일정표, 일자별판매실적분석, 유통기한, 상품마스터 등)을
 *     대상 스프레드시트의 같은 이름 탭에 그대로 덮어씀 (주소는 안 바뀜, 내용만 최신화)
 *  4. 처리된 원본 엑셀 파일은 "처리완료" 폴더로 옮겨서 중복 처리 방지
 *  5. 임시로 변환했던 시트는 삭제
 *
 * ------------------------------------------------------------
 *  설정 방법 (여기서부터 이어서)
 * ------------------------------------------------------------
 * 1) script.google.com 접속 → 새 프로젝트 생성
 *    (또는 대상 스프레드시트에서 확장 프로그램 > Apps Script)
 *
 * 2) 이 파일 내용을 통째로 붙여넣기 (아래 세 값은 이미 채워져 있음)
 *
 * 3) 왼쪽 메뉴 "서비스" 옆 + 버튼 클릭 → "Drive API" 검색해서 추가
 *    (엑셀 파일을 구글시트로 변환하려면 이 서비스가 필요합니다)
 *
 * 4) 상단에서 실행할 함수로 setupTrigger 선택 → 실행 버튼 클릭
 *    처음 실행하면 권한 승인 창이 뜸 → 본인 계정으로 승인
 *    (이 한 번의 실행으로 "5분마다 자동 확인" 트리거가 등록됩니다)
 *
 * 5) 이후로는 "업로드용" 폴더에 새 엑셀만 올리면, 5분 이내로
 *    자동으로 대상 스프레드시트가 최신 데이터로 바뀝니다.
 *    대시보드는 이 고정 스프레드시트 주소를 그대로 계속 바라보면 됩니다.
 *
 * ------------------------------------------------------------
 *  테스트하고 싶을 때
 * ------------------------------------------------------------
 *  - 트리거 기다리지 않고 바로 확인하고 싶으면, 함수 checkForNewFiles를
 *    직접 실행 버튼으로 눌러서 테스트 가능합니다.
 *  - 실행 후 왼쪽 "실행" 메뉴에서 로그(성공/실패 메시지)를 확인할 수 있습니다.
 * ============================================================
 */

const SOURCE_FOLDER_ID = 'REDACTED';   // 업로드용 폴더
const PROCESSED_FOLDER_ID = 'REDACTED'; // 처리완료 폴더
const TARGET_SPREADSHEET_ID = 'REDACTED';

// Vercel 서버만 알고 있는 비밀 키. Vercel 환경변수 GAS_KEY 에 똑같은 값을 넣어야 합니다.
// (이 웹앱 주소가 유출돼도 키가 없으면 데이터가 나오지 않습니다)
const API_KEY = 'REDACTED'; // 고정 스프레드시트


/**
 * 최초 1회 실행용: "5분마다 자동으로 새 파일 확인" 트리거를 등록합니다.
 * 이미 등록된 트리거가 있으면 중복 등록하지 않습니다.
 */
function setupTrigger() {
  const already = ScriptApp.getProjectTriggers().some(
    t => t.getHandlerFunction() === 'checkForNewFiles'
  );
  if (already) {
    Logger.log('이미 트리거가 등록되어 있습니다. 5분마다 자동 실행됩니다.');
    return;
  }
  ScriptApp.newTrigger('checkForNewFiles')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('트리거 등록 완료! 이제부터 5분마다 자동으로 새 파일을 확인합니다.');

  // 등록과 동시에 한 번 바로 실행해서 지금 폴더에 있는 파일도 처리
  checkForNewFiles();
}

/**
 * 업로드용 폴더를 확인해서, 새 엑셀 파일이 있으면 처리합니다.
 * (트리거에 의해 5분마다 자동 실행되거나, 수동으로 실행 버튼으로도 실행 가능)
 */
/**
 * 진행 상태를 기록해서, 대시보드가 폴링으로 "지금 몇 번째 파일 처리 중"을 볼 수 있게 합니다.
 */
function setProgress(status, currentFile, doneCount, totalCount) {
  PropertiesService.getScriptProperties().setProperty('PROGRESS', JSON.stringify({
    status: status, // 'idle' | 'processing' | 'done' | 'error'
    currentFile: currentFile || '',
    doneCount: doneCount || 0,
    totalCount: totalCount || 0,
    updatedAt: new Date().getTime()
  }));
}
function getProgress() {
  const raw = PropertiesService.getScriptProperties().getProperty('PROGRESS');
  if (!raw) return { status: 'idle', currentFile: '', doneCount: 0, totalCount: 0 };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { status: 'idle', currentFile: '', doneCount: 0, totalCount: 0 };
  }
}

function checkForNewFiles() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { Logger.log('다른 업데이트가 진행 중이라 건너뜁니다.'); return; }
  try {
    const n = checkForNewFilesInner_();
    // 새 파일을 반영했거나 저장본이 아직 없으면, 모두가 빠르게 받아갈 "저장본"을 새로 만듭니다
    if (n > 0 || !getSnapshotInfo_()) {
      setProgress('processing', '공유 데이터 저장본 만드는 중', 0, 1);
      buildSnapshot_();
    }
    setProgress(n > 0 ? 'done' : 'idle', '', 0, 0);
  } finally { lock.releaseLock(); }
}

function checkForNewFilesInner_() {
  const sourceFolder = DriveApp.getFolderById(SOURCE_FOLDER_ID);
  const processedFolder = DriveApp.getFolderById(PROCESSED_FOLDER_ID);
  const filesIter = sourceFolder.getFilesByType(MimeType.MICROSOFT_EXCEL);

  const fileList = [];
  while (filesIter.hasNext()) fileList.push(filesIter.next());
  const total = fileList.length;

  if (total === 0) {
    PropertiesService.getScriptProperties().deleteProperty('UPDATE_BY');
    Logger.log('새로 처리할 파일이 없습니다.');
    return 0;
  }

  let processedCount = 0;
  fileList.forEach(function (file, idx) {
    setProgress('processing', file.getName(), idx, total);
    try {
      Logger.log('처리 시작: ' + file.getName());
      processExcelFile(file);
      file.moveTo(processedFolder);
      Logger.log('처리 완료: ' + file.getName());
      processedCount++;
    } catch (err) {
      // 처리 실패한 파일은 업로드 폴더에 그대로 남겨둠 (다음 실행 때 재시도)
      Logger.log('처리 실패: ' + file.getName() + ' → ' + err.message);
    }
    setProgress('processing', file.getName(), idx + 1, total);
  });

  if (processedCount > 0) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_UPDATE', JSON.stringify({
      at: new Date().getTime(),
      by: props.getProperty('UPDATE_BY') || '자동(폴더 감시)',
      files: processedCount
    }));
  }
  PropertiesService.getScriptProperties().deleteProperty('UPDATE_BY');
  Logger.log(processedCount + '개 파일 처리 완료.');
  return processedCount;
}

/**
 * 엑셀 파일 하나를 받아서:
 *  1. 임시 구글시트로 변환
 *  2. 그 안의 탭들을 대상 스프레드시트의 같은 이름 탭에 덮어쓰기
 *  3. 임시 시트 삭제
 */
/**
 * 파일 이름에서 확장자, 날짜, "(1)" 같은 중복 표시를 떼어내서
 * "가용재고조회_olive_20260831 (1).xlsx" -> "가용재고조회_olive" 처럼 정리합니다.
 * (엑셀 내부 시트 이름은 여러 파일이 다 "Sheet1"처럼 겹칠 수 있어서,
 *  대신 이 정리된 파일 이름을 대상 탭 이름으로 씁니다 — 날짜만 다른 파일은 항상 같은 탭을 덮어씁니다)
 */
function cleanBaseName(fileName) {
  let name = fileName.replace(/\.(xlsx|xls)$/i, '');           // 확장자 제거
  name = name.replace(/\s*\(\d+\)\s*$/, '');                  // 끝의 "(1)" 같은 중복 표시 제거
  // 날짜(20260831, 2026-08-31 등)는 이름 어디에 있든 제거: 일자별판매실적분석_20261013_B2B2팀 -> 일자별판매실적분석_B2B2팀
  name = name.replace(/[_\-\s]?\d{4}[-.]?\d{2}[-.]?\d{2}(?=[_\-\s]|$)/g, '');
  name = name.replace(/[_\-\s]{2,}/g, '_').replace(/[_\-\s]+$/, '');
  name = name.trim();
  return name || 'data';
}

function processExcelFile(file) {
  const blob = file.getBlob();
  const baseName = cleanBaseName(file.getName());

  // 1) 엑셀 → 임시 구글시트로 변환 (Drive API v3 방식, 위 설정 3번 참고)
  const fileMetadata = {
    name: '__temp_import_' + file.getName() + '_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS
  };
  const tempFile = Drive.Files.create(fileMetadata, blob, { fields: 'id' });
  const tempSpreadsheet = SpreadsheetApp.openById(tempFile.id);

  try {
    const targetSpreadsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const tempSheets = tempSpreadsheet.getSheets();
    const singleSheet = tempSheets.length === 1;

    tempSheets.forEach(function (tempSheet, idx) {
      // 내부 시트 이름 대신 정리된 파일 이름을 탭 이름으로 사용 (겹침 방지)
      // 내부에 시트가 여러 개면 파일이름__내부시트이름 으로 구분
      const targetName = singleSheet ? baseName : (baseName + '__' + tempSheet.getName());
      const range = tempSheet.getDataRange();
      const data = range.getValues();

      let targetSheet = targetSpreadsheet.getSheetByName(targetName);
      if (!targetSheet) {
        // 대상 스프레드시트에 같은 이름 탭이 없으면 새로 생성
        targetSheet = targetSpreadsheet.insertSheet(targetName);
      } else {
        // 있으면 기존 내용을 전부 지우고 새로 채움 ("현재 시트 바꾸기"와 동일 효과)
        targetSheet.clear();
      }

      if (data.length > 0 && data[0].length > 0) {
        targetSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      }
    });
  } finally {
    // 2) 변환에 썼던 임시 구글시트 파일은 휴지통으로 (원본 엑셀은 이미 처리완료 폴더로 이동됨)
    DriveApp.getFileById(tempFile.id).setTrashed(true);
  }
}


/**
 * ============================================================
 *  스프레드시트에 "지금 업데이트" 메뉴 버튼 추가
 * ============================================================
 * 스프레드시트를 열 때마다 자동으로 상단 메뉴에 커스텀 메뉴가 생깁니다.
 * (아래 onOpen 함수는 별도로 실행할 필요 없이, 저장만 하면 다음에
 *  스프레드시트를 열 때 자동으로 적용됩니다)
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 재고관리')
    .addItem('지금 업데이트', 'runUpdateNow')
    .addToUi();
}

/**
 * 메뉴에서 "지금 업데이트"를 누르면 실행되는 함수.
 * 5분 기다릴 필요 없이 바로 업로드 폴더를 확인해서 반영합니다.
 */
function runUpdateNow() {
  const ui = SpreadsheetApp.getUi();
  checkForNewFiles();
  ui.alert('업데이트 확인이 끝났습니다. (새 파일이 없었으면 변경사항 없음)');
}


/**
 * ============================================================
 *  웹 앱 (Vercel 서버 전용 API)
 *  - 로그인/권한 확인은 Vercel 서버가 하고, 이 웹앱은 비밀 키(API_KEY)가 맞을 때만 응답합니다.
 *  - action=progress : 처리 진행 상황
 *  - action=meta     : 시트 목록(행/열 수) + 마지막 업데이트 시각/사람
 *  - action=rows     : 시트의 일부 행 (sheet, from, count) — 큰 시트를 나눠서 받기 위함
 *  - action=start    : 폴더의 새 파일 처리를 백그라운드로 시작 (by=업데이트한 사람 이메일)
 * ============================================================
 */
/** 공유 데이터 저장본: 모든 시트를 JSON으로 묶어 gzip 압축한 파일 1개 (Drive에 저장) */
function getSnapshotInfo_() {
  const raw = PropertiesService.getScriptProperties().getProperty('SNAPSHOT_INFO');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function buildSnapshot_() {
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
  const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(out), 'application/json', 'snapshot.json'), '__snapshot.json.gz');
  const props = PropertiesService.getScriptProperties();
  const oldId = props.getProperty('SNAPSHOT_FILE_ID');
  const file = DriveApp.getFolderById(PROCESSED_FOLDER_ID).createFile(gz);
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {} }
  props.setProperty('SNAPSHOT_FILE_ID', file.getId());
  props.setProperty('SNAPSHOT_INFO', JSON.stringify({ at: new Date().getTime(), size: file.getSize() }));
  Logger.log('저장본 생성 완료 (' + file.getSize() + ' bytes)');
}

/** 공유 설정(히어로 기준, 등급 기준, 직접 입력한 박스 정보)을 저장하는 숨은 탭. 이름이 __로 시작하면 저장본·대시보드 데이터에서 제외됩니다 */
function settingsSheet_() {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  let sh = ss.getSheetByName('__설정');
  if (!sh) { sh = ss.insertSheet('__설정'); sh.appendRow(['kind', 'key', 'value(JSON)', '수정자', '수정시각']); }
  return sh;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.key || p.key !== API_KEY) return jsonOut_({ error: 'unauthorized' });

  const action = p.action;
  if (action === 'progress') return jsonOut_(getProgress());

  if (action === 'meta') {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const sheets = ss.getSheets()
      .filter(function (sh) { return sh.getName().indexOf('__') !== 0; })
      .map(function (sh) { return { name: sh.getName(), rows: sh.getLastRow(), cols: sh.getLastColumn() }; });
    const raw = PropertiesService.getScriptProperties().getProperty('LAST_UPDATE');
    return jsonOut_({ sheets: sheets, lastUpdate: raw ? JSON.parse(raw) : null, progress: getProgress(), snapshot: getSnapshotInfo_() });
  }

  if (action === 'ensure') {
    // 저장본이 없으면 백그라운드에서 만들도록 예약 (이미 있으면 아무것도 안 함)
    if (getSnapshotInfo_()) return jsonOut_({ ok: true, exists: true });
    const props = PropertiesService.getScriptProperties();
    const pending = props.getProperty('SNAPSHOT_PENDING');
    if (pending && (new Date().getTime() - Number(pending)) < 10 * 60 * 1000) return jsonOut_({ ok: true, pending: true });
    props.setProperty('SNAPSHOT_PENDING', String(new Date().getTime()));
    ScriptApp.newTrigger('runSnapshotJob').timeBased().after(1000).create();
    return jsonOut_({ ok: true, scheduled: true });
  }

  if (action === 'settings_get') {
    const sh = settingsSheet_();
    const last = sh.getLastRow();
    const items = [];
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 5).getValues().forEach(function (r) {
        if (!r[0] || !r[1]) return;
        let v = null; try { v = JSON.parse(r[2]); } catch (e) {}
        items.push({ kind: String(r[0]), key: String(r[1]), value: v, by: String(r[3] || ''), at: r[4] ? new Date(r[4]).getTime() : 0 });
      });
    }
    return jsonOut_({ items: items });
  }

  if (action === 'settings_set' || action === 'settings_del') {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return jsonOut_({ error: 'busy' });
    try {
      const sh = settingsSheet_();
      const kind = String(p.kind || ''), key = String(p.key || '');
      if (!kind || !key) return jsonOut_({ error: 'bad args' });
      const last = sh.getLastRow();
      let row = -1;
      if (last >= 2) {
        const keys = sh.getRange(2, 1, last - 1, 2).getValues();
        for (let i = 0; i < keys.length; i++) { if (String(keys[i][0]) === kind && String(keys[i][1]) === key) { row = i + 2; break; } }
      }
      if (action === 'settings_del') {
        if (row > 0) sh.deleteRow(row);
        return jsonOut_({ ok: true });
      }
      const rec = [kind, key, String(p.value || 'null'), String(p.by || ''), new Date()];
      if (row > 0) sh.getRange(row, 1, 1, 5).setValues([rec]); else sh.appendRow(rec);
      return jsonOut_({ ok: true });
    } finally { lock.releaseLock(); }
  }

  if (action === 'bundle') {
    // 저장본 + 버전 정보를 한 번에. 상대가 같은 버전(have)을 이미 갖고 있으면 본문 없이 unchanged 만 돌려줌
    const props = PropertiesService.getScriptProperties();
    const info = getSnapshotInfo_();
    const lu = props.getProperty('LAST_UPDATE');
    const out = { snapshot: info, lastUpdate: lu ? JSON.parse(lu) : null };
    if (!info) { out.none = true; return jsonOut_(out); }
    if (String(p.have || '') === String(info.at)) { out.unchanged = true; return jsonOut_(out); }
    const id = props.getProperty('SNAPSHOT_FILE_ID');
    if (!id) { out.none = true; return jsonOut_(out); }
    out.b64 = Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes());
    return jsonOut_(out);
  }

  if (action === 'snapshot') {
    const id = PropertiesService.getScriptProperties().getProperty('SNAPSHOT_FILE_ID');
    if (!id) return jsonOut_({ error: 'no snapshot' });
    return jsonOut_({ b64: Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) });
  }

  if (action === 'rows') {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const sh = ss.getSheetByName(p.sheet);
    if (!sh) return jsonOut_({ error: 'no such sheet' });
    const from = Math.max(0, parseInt(p.from || '0', 10));
    const count = Math.max(1, Math.min(2000, parseInt(p.count || '1000', 10)));
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow === 0 || lastCol === 0 || from >= lastRow) return jsonOut_({ rows: [] });
    const n = Math.min(count, lastRow - from);
    const data = sh.getRange(from + 1, 1, n, lastCol).getValues();
    const tz = Session.getScriptTimeZone();
    const rows = data.map(function (row) {
      return row.map(function (cell) {
        if (Object.prototype.toString.call(cell) === '[object Date]') return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
        return cell;
      });
    });
    return jsonOut_({ rows: rows });
  }

  if (action === 'start') {
    const props = PropertiesService.getScriptProperties();
    const cur = getProgress();
    // 이미 진행 중이면(최근 10분 이내) 중복 시작하지 않음
    if ((cur.status === 'processing' || cur.status === 'queued') && (new Date().getTime() - (cur.updatedAt || 0)) < 10 * 60 * 1000) {
      return jsonOut_({ ok: true, alreadyRunning: true });
    }
    props.setProperty('UPDATE_BY', String(p.by || ''));
    setProgress('queued', '', 0, 0);
    ScriptApp.newTrigger('runUpdateJob').timeBased().after(1000).create();
    return jsonOut_({ ok: true });
  }

  return jsonOut_({ error: 'unknown action' });
}

/** action=ensure 가 예약한 1회용 트리거: 저장본이 없을 때만 만듭니다 */
function runSnapshotJob() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSnapshotJob') ScriptApp.deleteTrigger(t);
  });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (!getSnapshotInfo_()) buildSnapshot_();
  } finally {
    PropertiesService.getScriptProperties().deleteProperty('SNAPSHOT_PENDING');
    lock.releaseLock();
  }
}

/** action=start 가 예약한 1회용 트리거가 실행하는 함수 */
function runUpdateJob() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runUpdateJob') ScriptApp.deleteTrigger(t);
  });
  try {
    checkForNewFiles();
  } catch (err) {
    Logger.log('runUpdateJob 오류: ' + err.message);
    setProgress('error', '', 0, 0);
  }
}