// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
/* ---------------- Sheet type signatures for auto-detection (CSV/엑셀 업로드) ---------------- */
export const SHEET_SIGNATURES = [
  {key:'inventory', label:'가용재고조회', must:['창고','품번','품명','바코드'], required:true},
  {key:'schedule',  label:'제품일정표',   must:['품번','거래처','바코드', /^\d{1,2}월\s*입고일정$/], required:false},
  {key:'sales',     label:'일자별판매실적분석', must:['실적번호','거래처','품번','수량'], required:true},
  {key:'expiry',    label:'유통기한', must:['상품코드','LOT','유통기한','가용재고수량'], required:false},
  {key:'productMaster', label:'상품마스터', must:['상품코드','아웃무게g','인무게g','제품무게g'], required:false},
];

export function findHeaderRow(rows, mustContain){
  for(let i=0;i<Math.min(rows.length,12);i++){
    const row = (rows[i]||[]).map(c=>(c||'').toString().trim());
    const ok = mustContain.every(m=>{
      if(m instanceof RegExp) return row.some(cell=>m.test(cell));
      return row.includes(m);
    });
    if(ok) return {idx:i, header:row};
  }
  return null;
}

export function colIdx(header,name){
  if(name instanceof RegExp) return header.findIndex(cell=>name.test(cell));
  return header.indexOf(name);
}

// "N월 입고일정" 형태의 컬럼들을 순서대로 찾아서, 몇 월이든 상관없이 첫 3개월치를 매핑
export function findMonthColumns(header){
  const found = [];
  header.forEach((cell, idx)=>{
    const m = /^(\d{1,2})월\s*입고일정$/.exec(cell);
    if(m) found.push({month:parseInt(m[1],10), dIdx:idx});
  });
  found.sort((a,b)=>{
    // 연말/연초 걸치는 경우(예: 12월,1월,2월)도 순서 꼬이지 않게, 큰 달이 먼저 나오면 그 뒤는 다음해로 취급
    return 0; // 원본 파일에 이미 왼쪽부터 미래 순서로 정렬되어 있으므로 등장 순서(idx) 그대로 사용
  });
  found.sort((a,b)=>a.dIdx-b.dIdx);
  return found.slice(0,3).map(f=>{
    const qIdx = header.findIndex((cell,i)=> i>f.dIdx && new RegExp(`^${f.month}월\\s*입고수량$`).test(cell));
    return {month:f.month, dIdx:f.dIdx, qIdx};
  });
}

export function num(v){
  if(v===null||v===undefined) return 0;
  const s = String(v).replace(/,/g,'').trim();
  if(s==='') return 0;
  const n = Number(s);
  return isNaN(n)?0:n;
}

export function parseDateStr(v){
  if(!v) return null;
  const s = String(v).trim();
  if(!s) return null;
  const norm = s.replace(/[./]/g, '-');
  // YYYY-MM-DD (or with trailing time) — 로컬 타임존 기준으로 직접 생성 (UTC 파싱으로 인한 하루 밀림 방지)
  let m = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){
    const d = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    if(!isNaN(d.getTime())) return d;
  }
  // MM-DD-YYYY (미국식 내보내기 대비)
  m = norm.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if(m){
    const mm = parseInt(m[1],10), dd = parseInt(m[2],10), yyyy = parseInt(m[3],10);
    if(mm>=1 && mm<=12 && dd>=1 && dd<=31){
      const d = new Date(yyyy, mm-1, dd);
      if(!isNaN(d.getTime())) return d;
    }
  }
  // 마지막 수단: 브라우저 기본 파서
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

export function parseInventory(rows){
  const hit = findHeaderRow(rows, ['창고','품번','품명','바코드']);
  if(!hit) return [];
  const {idx,header} = hit;
  const c = {
    창고:colIdx(header,'창고'), 가용재고:colIdx(header,'가용재고'), 품번:colIdx(header,'품번'),
    품명:colIdx(header,'품명'), 바코드:colIdx(header,'바코드'), 규격:colIdx(header,'규격'),
    현재고:colIdx(header,'현재고'), 안전재고:colIdx(header,'안전재고'),
  };
  const iIdx = header.indexOf('입고예정'); const oIdx = header.indexOf('출고예정');
  const out = [];
  for(let i=idx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const pn = (r[c.품번]||'').toString().trim();
    const wh = (r[c.창고]||'').toString().trim();
    if(!pn || !wh) continue;
    out.push({
      창고:wh, 가용재고:num(r[c.가용재고]), 품번:pn, 품명:(r[c.품명]||'').toString().trim(),
      바코드:(r[c.바코드]||'').toString().trim(), 규격:(r[c.규격]||'').toString().trim(),
      현재고:num(r[c.현재고]), 입고예정:num(r[iIdx]), 출고예정:num(r[oIdx]),
      안전재고:num(r[c.안전재고]),
    });
  }
  return out;
}

export function parseSchedule(rows){
  const hit = findHeaderRow(rows, ['품번','거래처','바코드', /^\d{1,2}월\s*입고일정$/]);
  if(!hit) return [];
  const {idx,header} = hit;
  const months = findMonthColumns(header); // 파일에 실제 있는 월들을 등장 순서대로, 최대 3개
  const labels = months.map(m=>m.month+'월');
  while(labels.length<3) labels.push('-');
  const c = {
    품번:colIdx(header,'품번'), 품명:colIdx(header,'품명'), 거래처:colIdx(header,'거래처'),
    바코드:colIdx(header,'바코드'), 품목상태:colIdx(header,'품목상태'),
    가용재고:colIdx(header,'가용재고'), 재고합계:colIdx(header,'재고합계'),
    aug_d: months[0]?months[0].dIdx:-1, aug_q: months[0]?months[0].qIdx:-1,
    sep_d: months[1]?months[1].dIdx:-1, sep_q: months[1]?months[1].qIdx:-1,
    oct_d: months[2]?months[2].dIdx:-1, oct_q: months[2]?months[2].qIdx:-1,
  };
  const out = [];
  for(let i=idx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const pn = (r[c.품번]||'').toString().trim();
    if(!pn) continue;
    out.push({
      품번:pn, 품명:(r[c.품명]||'').toString().trim(), 거래처:(r[c.거래처]||'').toString().trim(),
      바코드:(r[c.바코드]||'').toString().trim(), 품목상태:(r[c.품목상태]||'').toString().trim(),
      가용재고:num(r[c.가용재고]), 재고합계:num(r[c.재고합계]),
      aug_d: c.aug_d>=0?(r[c.aug_d]||'').toString().trim():'', aug_q: c.aug_q>=0?num(r[c.aug_q]):0,
      sep_d: c.sep_d>=0?(r[c.sep_d]||'').toString().trim():'', sep_q: c.sep_q>=0?num(r[c.sep_q]):0,
      oct_d: c.oct_d>=0?(r[c.oct_d]||'').toString().trim():'', oct_q: c.oct_q>=0?num(r[c.oct_q]):0,
    });
  }
  out.monthLabels = labels; // 예: ['9월','10월','11월'] — 실제 파일에 있던 월 그대로
  return out;
}

export function parseSales(rows){
  const hit = findHeaderRow(rows, ['실적번호','거래처','품번','수량']);
  if(!hit) return [];
  const {idx,header} = hit;
  const c = {
    구분:colIdx(header,'구분'), 실적번호:colIdx(header,'실적번호'), 실적일자:colIdx(header,'실적일자'),
    거래처:colIdx(header,'거래처'), 품명:colIdx(header,'품명'), 품번:colIdx(header,'품번'),
    수량:colIdx(header,'수량'), 원화판매금액계:colIdx(header,'원화판매금액계'),
  };
  const out = [];
  for(let i=idx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const rn = (r[c.실적번호]||'').toString().trim();
    const gubun = (r[c.구분]||'').toString().trim();
    if(!rn || gubun==='TOTAL') continue;
    const d = parseDateStr(r[c.실적일자]);
    if(!d) continue;
    out.push({
      거래처:(r[c.거래처]||'').toString().trim(), 품번:(r[c.품번]||'').toString().trim(),
      품명:(r[c.품명]||'').toString().trim(), 수량:num(r[c.수량]),
      실적일자:d, 금액:num(r[c.원화판매금액계]),
    });
  }
  return out;
}

export function parseExpiry(rows){
  const hit = findHeaderRow(rows, ['상품코드','LOT','유통기한','가용재고수량']);
  if(!hit) return [];
  const {idx,header} = hit;
  const c = {
    품번:colIdx(header,'상품코드'), 품명:colIdx(header,'상품명'), 바코드:colIdx(header,'바코드'),
    창고명:colIdx(header,'창고명'), LOT:colIdx(header,'LOT'), 유통기한:colIdx(header,'유통기한'),
    재고수량:colIdx(header,'재고수량'), 가용재고수량:colIdx(header,'가용재고수량'),
  };
  const out = [];
  for(let i=idx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const pn = (r[c.품번]||'').toString().trim();
    if(!pn || pn==='TOTAL') continue;
    const d = parseDateStr(r[c.유통기한]);
    out.push({
      품번:pn, 품명:(r[c.품명]||'').toString().trim(), 바코드:(r[c.바코드]||'').toString().trim(),
      창고명:(r[c.창고명]||'').toString().trim(), LOT:(r[c.LOT]||'').toString().trim(),
      유통기한: d, 유통기한Str:(r[c.유통기한]||'').toString().trim(),
      재고수량:num(r[c.재고수량]), 가용재고수량:num(r[c.가용재고수량]),
    });
  }
  return out;
}

export function parseProductMaster(rows){
  const hit = findHeaderRow(rows, ['상품코드','아웃무게g','인무게g','제품무게g']);
  if(!hit) return [];
  const {idx,header} = hit;
  const c = {
    품번:colIdx(header,'상품코드'), 품명:colIdx(header,'상품명'), 바코드:colIdx(header,'바코드'),
    아웃W:colIdx(header,'아웃W'), 아웃D:colIdx(header,'아웃D'), 아웃H:colIdx(header,'아웃H'), 아웃무게g:colIdx(header,'아웃무게g'), 아웃입수:colIdx(header,'아웃입수'),
    인W:colIdx(header,'인W'), 인D:colIdx(header,'인D'), 인H:colIdx(header,'인H'), 인무게g:colIdx(header,'인무게g'), 인입수:colIdx(header,'인입수'),
    제품W:colIdx(header,'제품W'), 제품D:colIdx(header,'제품D'), 제품H:colIdx(header,'제품H'), 제품무게g:colIdx(header,'제품무게g'),
    PLT1단:colIdx(header,'PLT1단'), PLT단수:colIdx(header,'PLT단수'), PLT총높이cm:colIdx(header,'PLT총높이cm'),
    PLT박스수:colIdx(header,'PLT박스수'), PLT입수:colIdx(header,'PLT입수'), PLT무게kg:colIdx(header,'PLT무게kg'),
    입고PLT종류:colIdx(header,'입고PLT종류'),
  };
  const out = [];
  for(let i=idx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const pn = (r[c.품번]||'').toString().trim();
    if(!pn) continue;
    out.push({
      품번:pn, 품명:(r[c.품명]||'').toString().trim(), 바코드:(r[c.바코드]||'').toString().trim(),
      아웃W:num(r[c.아웃W]), 아웃D:num(r[c.아웃D]), 아웃H:num(r[c.아웃H]), 아웃무게g:num(r[c.아웃무게g]), 아웃입수:num(r[c.아웃입수]),
      인W:num(r[c.인W]), 인D:num(r[c.인D]), 인H:num(r[c.인H]), 인무게g:num(r[c.인무게g]), 인입수:num(r[c.인입수]),
      제품W:num(r[c.제품W]), 제품D:num(r[c.제품D]), 제품H:num(r[c.제품H]), 제품무게g:num(r[c.제품무게g]),
      PLT1단:num(r[c.PLT1단]), PLT단수:num(r[c.PLT단수]), PLT총높이cm:num(r[c.PLT총높이cm]),
      PLT박스수:num(r[c.PLT박스수]), PLT입수:num(r[c.PLT입수]), PLT무게kg:num(r[c.PLT무게kg]),
      입고PLT종류:(r[c.입고PLT종류]||'').toString().trim(),
    });
  }
  return out;
}

export function detectSheetType(rows){
  for(const sig of SHEET_SIGNATURES){
    if(findHeaderRow(rows, sig.must)) return sig.key;
  }
  return null;
}

export function teamFromName(n){ const m = String(n||'').match(/B2B\s*([12])\s*팀/i); return m ? 'B2B'+m[1]+'팀' : null; }

export function teamFromRows(rows){
  const hit = findHeaderRow(rows, ['실적번호','거래처','품번','수량']); if(!hit) return null;
  const ci = colIdx(hit.header,'부서'); if(ci<0) return null;
  const cnt = {};
  for(let i=hit.idx+1;i<rows.length && i<hit.idx+300;i++){
    const m = String((rows[i]||[])[ci]||'').match(/B2B\s*([12])\s*팀/i);
    if(m){ const k='B2B'+m[1]+'팀'; cnt[k]=(cnt[k]||0)+1; }
  }
  const ks = Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
  return ks[0]||null;
}
