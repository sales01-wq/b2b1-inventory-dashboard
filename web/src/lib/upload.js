// index.html 에서 그대로 옮긴 업로드 처리입니다. 바꾼 곳에는 "port:" 주석을 달았습니다.
// XLSX · Papa 는 운영과 같이 index.html 의 <script> 로 불러온 전역 객체를 씁니다.
import {state} from './store.js';
import {SHEET_SIGNATURES, detectSheetType, parseInventory, parseSchedule, parseSales, parseExpiry, parseProductMaster, teamFromName, teamFromRows} from './parse.js';
import {salesForTeam, computeDerived} from './forecast.js';

export const unresolvedFiles = [];

export function readFileAsText(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(new Error('READ_FAIL'));
    reader.readAsText(file, 'UTF-8');
  });
}

export function readFileAsArrayBuffer(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(new Error('READ_FAIL'));
    reader.readAsArrayBuffer(file);
  });
}

export async function handleFiles(fileList){
  const files = Array.from(fileList).filter(f=>/\.(csv|xlsx|xls)$/i.test(f.name));
  if(files.length===0) return;
  for(const file of files){
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    try{
      if(isExcel){
        if(typeof XLSX === 'undefined'){
          throw new Error('엑셀 처리 라이브러리(XLSX)를 불러오지 못했습니다. 네트워크/광고차단 확장프로그램을 확인 후 페이지를 새로고침 해주세요.');
        }
        const buf = await readFileAsArrayBuffer(file);
        let wb;
        try{
          wb = XLSX.read(buf, {type:'array'});
        }catch(readErr){
          // 일부 구글시트 내보내기 xlsx에서 스타일 파싱 중 오류가 나는 경우가 있어, 옵션을 낮춰 재시도
          try{
            wb = XLSX.read(buf, {type:'array', cellStyles:false, bookVBA:false, cellHTML:false, dense:true});
          }catch(retryErr){
            throw new Error(`엑셀 파일 파싱에 실패했습니다 (${readErr.message}). 구글 시트에서 '파일 → 다운로드 → 쉼표로 구분된 값(.csv)'로 다시 받아서 올려주시면 확실합니다.`);
          }
        }
        if(!wb.SheetNames || wb.SheetNames.length===0){
          throw new Error('엑셀 파일 안에서 시트를 찾지 못했습니다.');
        }
        wb.SheetNames.forEach(sheetName=>{
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''});
          const detected = detectSheetType(rows);
          unresolvedFiles.push({fileName:`${file.name} — ${sheetName}`, rows, key:detected});
        });
      } else {
        const text = await readFileAsText(file);
        const rows = Papa.parse(text, {skipEmptyLines:false}).data;
        const detected = detectSheetType(rows);
        unresolvedFiles.push({fileName:file.name, rows, key:detected});
      }
    }catch(e){
      unresolvedFiles.push({fileName:file.name, rows:null, key:null, error:true, errorMsg:(e&&e.message)||String(e)});
    }
  }
  // port: 목록 다시 그리기(renderUploadStatus) 제거 — 화면이 unresolvedFiles 를 그림
}

export function applyUploadedData(mode){
  const byKey = {};
  unresolvedFiles.forEach(f=>{ if(f.key && f.rows) byKey[f.key] = f.rows; });
  // 필수 시트라도, 이번에 안 올라왔지만 예전에 이미 로드된 데이터가 있으면 그걸 그대로 재사용 (진짜 부족한 경우만 에러)
  const hasSalesAny = Object.keys(state.salesByTeam||{}).some(k=>(state.salesByTeam[k]||[]).length>0);
  const stillMissing = SHEET_SIGNATURES.filter(s=>s.required && !byKey[s.key] && (s.key==='sales' ? !hasSalesAny : (!state[s.key] || state[s.key].length===0))).map(s=>s.label);
  if(stillMissing.length>0){
    state.error = `다음 시트 데이터가 없습니다: ${stillMissing.join(', ')}. 파일을 추가로 올리거나 드롭다운에서 시트 종류를 선택해주세요.`;
    return {error:state.error}; // port: 배너 그리기 대신 반환
  }
  try{
    if(byKey.inventory) state.inventory = parseInventory(byKey.inventory);
    if(byKey.schedule){ state.schedule = parseSchedule(byKey.schedule); state.scheduleMonthLabels = state.schedule.monthLabels || ['8월','9월','10월']; }
    const salesSrc = unresolvedFiles.filter(f=>f.key==='sales' && f.rows);
    if(salesSrc.length){
      // 파일 이름의 팀(B2B1팀/B2B2팀) → 없으면 '부서' 열 → 없으면 B2B1팀. 이름에 팀이 적힌 파일이 우선
      const tagged = salesSrc.map(f=>{ const nm = teamFromName(f.fileName); return {team: nm || teamFromRows(f.rows) || 'B2B1팀', explicit: !!nm, rows: f.rows}; });
      tagged.sort((a,b)=>(a.explicit?1:0)-(b.explicit?1:0));
      const fresh = {};
      tagged.forEach(t=>{ fresh[t.team] = parseSales(t.rows); });
      state.salesByTeam = Object.assign({}, state.salesByTeam, fresh);
    }
    state.sales = salesForTeam();
    if(byKey.expiry) state.expiry = parseExpiry(byKey.expiry);
    if(byKey.productMaster) state.productMaster = parseProductMaster(byKey.productMaster);
    computeDerived();
    state.loaded = true;
    state.error = null;
    state.lastSync = new Date();
    state.fetchMode = mode || 'upload';
    unresolvedFiles.length = 0;
    const updatedList = SHEET_SIGNATURES.filter(s=>byKey[s.key]).map(s=>s.label);
    const reusedList = SHEET_SIGNATURES.filter(s=>!byKey[s.key] && state[s.key] && state[s.key].length>0).map(s=>s.label);
    // port: 완료 메시지 · 전체 다시 그리기 · 개요 탭 이동은 화면이 이 결과로 처리
    return {updatedList, reusedList};
  }catch(e){
    state.error = '데이터 계산 중 오류가 발생했습니다: ' + e.message;
    return {error:state.error};
  }
}
