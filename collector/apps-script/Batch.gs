/**
 * 업로드 폴더의 파일을 "한 묶음"으로 전부 아니면 전무로 반영 — 기존 Apps Script 에 추가하는 코드입니다.
 *
 * 기존 checkForNewFilesInner_ 는 파일을 하나씩 처리해서, 5개 중 하나가 실패하면 나머지만 새 데이터로 바뀌는 "일부만 반영"이 생기고
 * (덮어쓰기도 clear() 후 쓰기라 중간에 실패하면 빈 탭이 남음), 실패한 파일은 5분마다 계속 재시도됐습니다.
 * 여기서는 ① 폴더의 모든 파일(엑셀 · 선택적으로 ERP_BUNDLE_*.zip)을 읽고 전부 검사 → ② 전부 임시 탭에 쓰기 → ③ 이름만 바꿔 교체(실패하면 되돌림)
 * → ④ 다 끝난 뒤에야 파일을 처리완료로 이동. 하나라도 문제가 있으면 시트도 파일도 그대로 두고 이유만 기록합니다 (문제 파일을 고치면 다음 주기에 반영).
 *
 * 기존 방식(엑셀을 폴더에 올리기, 바뀐 파일만 올리기, 상품마스터 올리기)은 그대로 동작하고, zip 은 선택입니다.
 * 탭 이름 규칙(날짜 · (1) 을 뗀 파일 이름), 여러 시트가 든 엑셀(파일이름__시트이름)도 기존과 같습니다.
 * 설치: 이 파일 + SnapshotGuard.gs + DryRun.gs 를 추가하고, 기존 코드 3곳을 수정합니다 (맨 아래 설명).
 */
const BUNDLE_ALLOWED_TABS = /^(가용재고조회|WMS창고재고관리|일자별판매실적분석|제품일정표)/;   // zip(수집기 · pack)이 쓸 수 있는 탭
const BUNDLE_PROTECTED_TABS = /^상품마스터/;                                              // zip 은 상품마스터 탭을 절대 건드리지 않음
// 파일(탭) 이름 앞부분 → 기대하는 시트 종류. 이 이름이면 내용이 그 종류가 아닐 때 거부 (엉뚱한 파일이 탭을 덮는 것 방지)
const NAME_TYPES_ = { '가용재고조회': 'inventory', 'WMS창고재고관리': 'expiry', '유통기한': 'expiry', '일자별판매실적분석': 'sales', '제품일정표': 'schedule', '상품마스터': 'productMaster' };

function expectedTypeFor_(tab) {
  const keys = Object.keys(NAME_TYPES_);
  for (let i = 0; i < keys.length; i++) if (tab.indexOf(keys[i]) === 0) return NAME_TYPES_[keys[i]];
  return null;
}

/** 파일 1개(엑셀 blob)를 임시 구글시트로 바꿔 읽고 검사. 대상 시트는 건드리지 않음. 반환: [{target, data, type, source}] */
function stageExcelBlob_(blob, fileName, temps, strict) {
  const base = cleanBaseName(fileName);   // 기존 규칙 그대로
  const tmp = Drive.Files.create({ name: '__temp_import_' + fileName + '_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS }, blob, { fields: 'id' });
  temps.push(tmp.id);
  const sheets = SpreadsheetApp.openById(tmp.id).getSheets();
  if (strict && sheets.length !== 1) throw new Error('시트가 1개가 아님');
  const single = sheets.length === 1, out = [];
  sheets.forEach(function (sh) {
    const data = sh.getDataRange().getValues();
    if (!single && data.length === 0) return;                 // 여러 시트 파일의 빈 시트는 건너뜀
    const target = single ? base : base + '__' + sh.getName();
    if (data.length < 2 || data[0].length === 0) throw new Error('데이터가 없음 (' + target + ')');
    const got = sheetTypeOf_(data);                           // SnapshotGuard.gs: 머리글로 시트 종류 확인
    const want = expectedTypeFor_(target);
    if (!got) throw new Error('시트 종류를 알 수 없음 (' + target + ')');
    if (want && got !== want) throw new Error('시트 종류가 이름과 맞지 않음: ' + target + ' 은(는) ' + want + ' 이어야 하는데 ' + got + ' 로 인식됨');
    if (dataRows_(data) < 1) throw new Error('데이터 행이 없음 (' + target + ')');
    out.push({ target: target, data: data, type: got });
  });
  return out;
}

/** zip 묶음(선택): 안의 엑셀을 전부 읽고 검사. 허용된 탭 이름만 · 상품마스터 금지 */
function readBundle_(file, temps) {
  const parts = Utilities.unzip(file.getBlob().setContentType('application/zip'));
  if (parts.length === 0) throw new Error('묶음이 비어 있음');
  const out = [];
  parts.forEach(function (p) {
    const name = p.getName();
    if (!/\.xlsx$/i.test(name)) throw new Error('엑셀이 아닌 파일: ' + name);
    const target = cleanBaseName(name);
    if (!BUNDLE_ALLOWED_TABS.test(target) || BUNDLE_PROTECTED_TABS.test(target)) throw new Error('허용되지 않는 탭 이름: ' + target);
    stageExcelBlob_(p, name, temps, true).forEach(function (s) { out.push(s); });
  });
  return out;
}

/** 폴더의 파일을 전부 읽고 검사 (아무것도 바꾸지 않음). 반환: {staged, sources, problems:[{file, msg}]} */
function stageFolder_(sourceFolder, temps) {
  const sources = [], zips = [];
  const it = sourceFolder.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (it.hasNext()) sources.push(it.next());
  const all = sourceFolder.getFiles();
  while (all.hasNext()) { const f = all.next(); if (/^ERP_BUNDLE_.*\.zip$/i.test(f.getName())) zips.push(f); }
  const byName = function (a, b) { return a.getName() < b.getName() ? -1 : 1; };
  zips.sort(byName); sources.sort(byName);
  const staged = [], problems = [], owner = {};
  zips.concat(sources).forEach(function (f, idx, list) {
    setProgress('processing', f.getName(), idx, list.length);
    try {
      const items = /\.zip$/i.test(f.getName()) ? readBundle_(f, temps) : stageExcelBlob_(f.getBlob(), f.getName(), temps, false);
      items.forEach(function (s) {
        if (owner[s.target]) throw new Error('같은 탭(' + s.target + ')을 만드는 파일이 둘: ' + owner[s.target] + ', ' + f.getName() + ' — 하나만 남겨 주세요');
        owner[s.target] = f.getName(); s.source = f.getName(); staged.push(s);
      });
    } catch (err) { problems.push({ file: f.getName(), msg: String(err.message) }); }
  });
  return { staged: staged, sources: zips.concat(sources), problems: problems };
}

/** 검사를 통과한 시트들을 전부 반영: 임시 탭에 쓰기 → 이름만 바꿔 교체 (실패하면 되돌리고 던짐) */
function applyStaged_(staged) {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const created = [];
  try {
    staged.forEach(function (s) {
      const old = ss.getSheetByName('__new_' + s.target); if (old) ss.deleteSheet(old);
      const sh = ss.insertSheet('__new_' + s.target); created.push(sh);
      sh.getRange(1, 1, s.data.length, s.data[0].length).setValues(s.data);
      s.sheet = sh;
    });
  } catch (err) { created.forEach(function (sh) { try { ss.deleteSheet(sh); } catch (e) {} }); throw err; }
  const swapped = [];
  try {
    staged.forEach(function (s) {
      const cur = ss.getSheetByName(s.target);
      if (cur) cur.setName('__old_' + s.target);
      s.sheet.setName(s.target);
      swapped.push({ s: s, cur: cur });
    });
  } catch (err) {
    swapped.reverse().forEach(function (x) { try { x.s.sheet.setName('__new_' + x.s.target); if (x.cur) x.cur.setName(x.s.target); } catch (e) {} });
    throw err;
  }
  swapped.forEach(function (x) { if (x.cur) { try { ss.deleteSheet(x.cur); } catch (e) {} } });
}

function recordBatchProblem_(problems) {
  PropertiesService.getScriptProperties().setProperty('BUNDLE_ERROR', JSON.stringify({
    at: new Date().getTime(), file: problems[0].file,
    msg: problems.map(function (p) { return p.file + ': ' + p.msg; }).join(' / ') + ' → 시트 · 파일을 하나도 바꾸지 않았습니다'
  }));
}

/** 기존 checkForNewFilesInner_ 를 대체 (기존 것은 checkForNewFilesInnerLegacy_ 로 이름만 바꿔 보관). 반환: 반영한 파일 수 */
function checkForNewFilesInner_() {
  const sourceFolder = DriveApp.getFolderById(SOURCE_FOLDER_ID);
  const processedFolder = DriveApp.getFolderById(PROCESSED_FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const temps = [];
  try {
    const r = stageFolder_(sourceFolder, temps);
    if (r.sources.length === 0) { props.deleteProperty('UPDATE_BY'); Logger.log('새로 처리할 파일이 없습니다.'); return 0; }
    if (r.problems.length) { recordBatchProblem_(r.problems); Logger.log('묶음을 반영하지 않음: ' + JSON.stringify(r.problems)); props.deleteProperty('UPDATE_BY'); return 0; }
    try { applyStaged_(r.staged); }
    catch (err) { recordBatchProblem_([{ file: '(시트 쓰기)', msg: String(err.message) }]); Logger.log('시트 쓰기 실패, 되돌림: ' + err.message); props.deleteProperty('UPDATE_BY'); return 0; }
    r.sources.forEach(function (f) { try { f.moveTo(processedFolder); } catch (e) { Logger.log('이동 실패(다음 주기에 같은 내용으로 다시 처리): ' + f.getName()); } });
    props.setProperty('LAST_UPDATE', JSON.stringify({ at: new Date().getTime(), by: props.getProperty('UPDATE_BY') || '자동(폴더 감시)', files: r.sources.length }));
    props.deleteProperty('UPDATE_BY'); props.deleteProperty('BUNDLE_ERROR');
    Logger.log(r.sources.length + '개 파일 반영 완료 (' + r.staged.length + '개 탭).');
    return r.sources.length;
  } finally {
    temps.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  }
}

/*
 * ===== 기존 코드에서 바꿀 곳 (총 4곳, 모두 작은 수정) =====
 *  1) function checkForNewFilesInner_()  →  function checkForNewFilesInnerLegacy_()   (이름만 바꿈. 이 파일의 새 checkForNewFilesInner_ 가 대신 불림)
 *  2) function buildSnapshot_()          →  function buildSnapshotLegacy_()          (이름만 바꿈. SnapshotGuard.gs 의 새 buildSnapshot_ 이 대신 불림)
 *  3) doGet 의 action === 'bundle' 안, const out = {…}; 바로 아래에 한 줄 추가:   out.problem = readProblems_();
 *  4) doGet 의 action === 'settings_set' || 'settings_del' 안:
 *       const kind = String(p.kind || ''), key = String(p.key || '');
 *     →  const kind = String(p.kind || ''), key = String(p.skey !== undefined ? p.skey : p.key || '');
 *     (api/settings.js 가 이제 설정 이름을 skey 로 보냅니다. 이전에는 인증 키 key 가 설정 이름을 덮어써서 모든 설정이 한 줄에 합쳐지고 비밀 키가 '__설정' 탭에 적혔습니다)
 * 되돌리려면: 새 파일 3개를 지우고 1) 2) 의 이름을 원래대로 (3, 4 는 그대로 둬도 무방).
 * 이 4곳 수정은 original/Code.redacted.gs 에 적용해서 새 파일과 합쳐 실행하는 시험(integration.test.js)을 통과했습니다.
 */
