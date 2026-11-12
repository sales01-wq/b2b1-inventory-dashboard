/**
 * 수집기 묶음(ERP_BUNDLE_*.zip) 처리 — 기존 Apps Script 에 "추가"하는 코드입니다 (먼저 복사본에서 시험하세요).
 *
 * 수집기는 ERP 엑셀 5개를 zip 1개로 올립니다. zip 은 Drive 에 한 번에 나타나므로 일부만 처리되는 일이 없고,
 * 여기서는 ① 전부 읽고 검사 → ② 전부 임시 탭에 쓰기 → ③ 이름만 바꿔서 교체(실패하면 되돌림) 순서로 처리합니다.
 * 한 단계라도 실패하면 대상 시트는 하나도 바뀌지 않습니다. 상품마스터 탭은 건드리지 않습니다.
 *
 * 기존 코드 수정은 checkForNewFilesInner_ 안의 3줄뿐입니다 (맨 아래 설명 참고).
 */
const BUNDLE_ALLOWED_TABS = /^(가용재고조회|제품일정표|일자별판매실적분석|유통기한)/;   // 수집기가 쓸 수 있는 탭
const BUNDLE_PROTECTED_TABS = ['상품마스터'];                                        // ← 실제 상품마스터 탭 이름으로 확인하세요

function processErpBundles_(sourceFolder, processedFolder) {
  const bundles = [];
  const it = sourceFolder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^ERP_BUNDLE_.*\.zip$/i.test(f.getName())) bundles.push(f); }
  bundles.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });   // 오래된 것부터
  let done = 0;
  bundles.forEach(function (f) {
    try {
      processBundle_(f);
      PropertiesService.getScriptProperties().setProperty('UPDATE_BY', '수집기(자동)');
      f.moveTo(processedFolder);
      done++;
      Logger.log('묶음 처리 완료: ' + f.getName());
    } catch (err) {
      // 실패한 묶음은 이름 앞에 FAILED_ 를 붙여 업로드 폴더에 남김 (다시 처리하지 않음 — 수집기가 보고 다시 올림)
      Logger.log('묶음 처리 실패: ' + f.getName() + ' → ' + err.message);
      f.setName('FAILED_' + f.getName());
      PropertiesService.getScriptProperties().setProperty('BUNDLE_ERROR', JSON.stringify({ at: new Date().getTime(), file: f.getName(), msg: String(err.message) }));
    }
  });
  return done;
}

function processBundle_(file) {
  const parts = Utilities.unzip(file.getBlob().setContentType('application/zip'));
  if (parts.length === 0) throw new Error('묶음이 비어 있음');
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const temps = [], staged = [], seen = {};
  try {
    // ① 전부 읽고 검사 (이 단계에서는 대상 시트를 건드리지 않음)
    parts.forEach(function (p) {
      const name = p.getName();
      if (!/\.xlsx$/i.test(name)) throw new Error('엑셀이 아닌 파일: ' + name);
      const target = cleanBaseName(name);   // 기존 규칙 그대로: 날짜 · (1) 제거한 파일 이름 = 탭 이름
      if (!BUNDLE_ALLOWED_TABS.test(target) || BUNDLE_PROTECTED_TABS.indexOf(target) >= 0) throw new Error('허용되지 않는 탭 이름: ' + target);
      if (seen[target]) throw new Error('같은 탭 이름이 둘: ' + target);
      seen[target] = true;
      const tmp = Drive.Files.create({ name: '__temp_import_' + name + '_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS }, p, { fields: 'id' });
      temps.push(tmp.id);
      const sheets = SpreadsheetApp.openById(tmp.id).getSheets();
      if (sheets.length !== 1) throw new Error('시트가 1개가 아님: ' + name);
      const data = sheets[0].getDataRange().getValues();
      if (data.length < 2 || data[0].length === 0) throw new Error('데이터가 없음: ' + name);
      staged.push({ target: target, data: data });
    });
    // ② 전부 임시 탭에 쓰기 (실패하면 임시 탭만 지우고 끝)
    const created = [];
    try {
      staged.forEach(function (s) {
        const old = ss.getSheetByName('__new_' + s.target); if (old) ss.deleteSheet(old);
        const sh = ss.insertSheet('__new_' + s.target); created.push(sh);
        sh.getRange(1, 1, s.data.length, s.data[0].length).setValues(s.data);
        s.sheet = sh;
      });
    } catch (err) { created.forEach(function (sh) { try { ss.deleteSheet(sh); } catch (e) {} }); throw err; }
    // ③ 이름만 바꿔서 교체. 중간에 실패하면 되돌림
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
  } finally {
    temps.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  }
}

/*
 * ===== 기존 checkForNewFilesInner_ 에서 바꿀 3줄 =====
 *  1) const filesIter = ... 줄 바로 위에 추가:
 *       const bundleCount = processErpBundles_(sourceFolder, processedFolder);
 *  2) if (total === 0) { ... return 0; }  →  return bundleCount;
 *  3) let processedCount = 0;  →  let processedCount = bundleCount;
 * (LAST_UPDATE 의 by 는 processErpBundles_ 가 '수집기(자동)' 으로 설정)
 */
