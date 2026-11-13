// 기존 render* 함수 안에 섞여 있던 계산 부분만 옮긴 것 (HTML 만드는 부분은 React 화면이 대신함).
// 식은 index.html 과 같게 유지합니다. 결과는 views.test.js 가 운영 화면에 그려진 값과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';
import {brandPasses, groupOf, quarterLabel, scopedAvailable, salesDetailFor, usableAvailable, getRules, scopeForecastItem} from './forecast.js';
import {productList, buildSkuStatusData, buildPivotRows} from './sales.js';
import {detectSheetType, findHeaderRow, SHEET_SIGNATURES, teamFromName, teamFromRows} from './parse.js';
import {boxInfoFor, baseBarcode, buildExportRows, incomingItemsFor, shortDate} from './lookup.js';

/* renderOverview (1210행) */
export function overviewModel(){
  const f = state.forecast.filter(x=>brandPasses(x.brand));
  const counts = {긴급:0,위험:0,주의:0,관찰:0,'안전(입고예정)':0,안전:0,단발성:0,휴면:0,데이터부족:0};
  f.forEach(x=>counts[x.grade]++);
  const safeCombined = counts.안전 + counts['안전(입고예정)'];
  const total3 = counts.긴급 + counts.위험 + counts.주의 + counts.관찰 + safeCombined; // 단발성·데이터부족 제외
  const nNow = counts.긴급 + counts.위험, nSoon = counts.주의, nOk = counts.관찰 + safeCombined, nRef = counts.단발성 + counts.휴면 + counts.데이터부족;
  const circles = [{label:'위험', count:nNow}, {label:'주의', count:nSoon}, {label:'여유', count:nOk}]
    .map(c=>({...c, pct: total3>0 ? Math.round(c.count/total3*100) : 0}));
  const pnSet = new Set(f.map(x=>x.품번));
  const sold6moTotal = Array.from(state.salesByProduct.entries()).reduce((s,[pn,x])=> pnSet.has(pn) ? s+x.sum6mo : s, 0);
  return {total:f.length, brands:Array.from(ui.brandSelected), counts, circles, nNow, nSoon, nOk, nRef, totalCustomers:state.customers.length, sold6moTotal};
}

/* renderForecast (1404행): 필터 · 거래처 기준 재계산 · 상태 칩 건수 · 발주 필요 합계 · 최근 6개월 월별 판매 */
export function forecastModel(){
  const isOverstock = ui.forecastGrade==='과잉재고';
  // 과잉재고는 정의상 '최근 6개월간 판매 이력이 없는 품목'만 대상이라, 판매이력 필터와 상관없이 그 품목들을 포함시킴
  // 거래처 필터(여러 개 = OR): 고른 거래처 중 하나라도 최근 12개월 안에 산 적 있는 품목만 남기고, 그 거래처들의 판매만으로 목표 · 부족 · 상태를 다시 계산 (scopeForecastItem).
  // 품목은 한 번만 나오고 재고 · 입고예정은 품목당 한 번 그대로라 같은 재고를 거래처마다 중복해서 세지 않음
  let src = state.forecast.filter(x=>brandPasses(x.brand));
  if(ui.forecastCustomers.size>0){
    const cut = new Date(); cut.setFullYear(cut.getFullYear()-1);
    src = src.filter(x=>(state.salesRowsByProduct.get(x.품번)||[]).some(r=>ui.forecastCustomers.has(r.거래처) && r.실적일자>=cut))
      .map(x=>scopeForecastItem(x, ui.forecastCustomers));
  }
  // 과잉재고는 정의상 '최근 6개월간 판매 이력이 없는 품목'만 대상이라, 판매이력 필터와 상관없이 그 품목들을 포함시킴
  let list = isOverstock
    ? src.filter(x=>x.sold6===0)
    : src.filter(x=>ui.forecastShowNoSales || ui.forecastGrade==='참고' || x.sold6>0 || x.orderQty>0);

  if(ui.forecastBrand) list = list.filter(x=>x.brand===ui.forecastBrand);
  const baseAll = state.forecast.filter(x=>brandPasses(x.brand));
  const brands = Array.from(new Set(baseAll.map(x=>x.brand))).filter(Boolean);
  const cnt = {위험:0,주의:0,여유:0,참고:0};
  list.forEach(x=>{ cnt[groupOf(x.grade)]++; });
  const gradeChips = [['조치필요','생산 필요 + 추천',cnt.위험+cnt.주의],['위험','생산 필요',cnt.위험],['주의','생산 추천',cnt.주의],['여유','여유',cnt.여유],['참고','참고',cnt.참고],['','전체',list.length]];

  const needList = list.filter(x=>x.orderQty>0 && !['휴면','단발성','데이터부족'].includes(x.grade));
  const needItems = needList.length, needQty = needList.reduce((a,x)=>a+x.orderQty,0);
  if(isOverstock){
    const scope = ui.forecastOverstockScope;
    list = list.map(x=>{
      const avail = scopedAvailable(x.품번, scope);
      return {...x, available:avail};
    }).filter(x=> x.available>0); // 재고가 있는 것만 과잉재고
  } else if(ui.forecastGrade==='조치필요'){
    list = list.filter(x=>x.grade==='긴급' || x.grade==='위험' || x.grade==='주의');
  } else if(ui.forecastGrade){
    list = list.filter(x=>groupOf(x.grade)===ui.forecastGrade);
  }
  if(ui.forecastSearch){
    const s = ui.forecastSearch.toLowerCase();
    list = list.filter(x=>x.품번.toLowerCase().includes(s) || x.품명.toLowerCase().includes(s));
  }
  if(ui.forecastPnChips.size>0){
    const chips = Array.from(ui.forecastPnChips).map(c=>c.toLowerCase());
    list = list.filter(x=> chips.some(c=>x.품번.toLowerCase().includes(c)));
    // 검색한 품번 순서대로 정렬 (매칭된 칩의 입력 순서 기준)
    list.sort((a,b)=>{
      const ai = chips.findIndex(c=>a.품번.toLowerCase().includes(c));
      const bi = chips.findIndex(c=>b.품번.toLowerCase().includes(c));
      return ai-bi;
    });
  } else if(isOverstock){
    list.sort((a,b)=> b.available - a.available); // 재고 많은 순
  }
  ui.forecastVisiblePns = list.map(x=>x.품번); ui._forecastCsvRows = list; // 전체 선택 대상 (필터링된 전체, 더보기 이전 포함)

  // 월별 판매: 선택한 연도의 1~12월 (기본 올해). 거래처를 골랐으면 그 거래처들 합계. 반품 · 마이너스는 제외 (목표 계산과 같은 기준)
  const years = new Set([new Date().getFullYear()]);
  state.sales.forEach(r=>years.add(r.실적일자.getFullYear()));
  const yearList = Array.from(years).sort((p,q)=>q-p);
  const year = yearList.includes(ui.forecastYear) ? ui.forecastYear : new Date().getFullYear();
  const months = Array.from({length:12}, (_,m)=>({y:year, m}));
  const monthly = x=>{
    const arr = months.map(()=>0);
    (state.salesRowsByProduct.get(x.품번)||[]).forEach(r=>{
      if(ui.forecastCustomers.size>0 && !ui.forecastCustomers.has(r.거래처)) return;
      const d=r.실적일자, q=Number(r.수량);
      if(d.getFullYear()===year && q>0 && Number.isFinite(q)) arr[d.getMonth()]+=q;
    });
    return arr;
  };
  return {list, isOverstock, brands, gradeChips, needItems, needQty, months, monthly, year, yearList, scopeLabel: ui.forecastCustomers.size>0 ? '선택 거래처 기준' : '전체 거래처 기준', scopeCount: ui.forecastCustomers.size};
}

/* 펼친 행: 목표 재고 근거(월별 합계) · 거래처별 월 판매 · 최근 판매 20건 · 입고예정 · 반품 · 대량 판매 표시 */
export function forecastDetail(x){
  const customers = Array.from((x.byCustomer||new Map()).entries()).map(([거래처,months])=>({거래처, months, total:months.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);
  const details = salesDetailFor(x.품번).slice(0,20);
  const incomingRows = [];
  if(x.sched){
    const ml = state.scheduleMonthLabels;
    if(x.sched.aug_q>0) incomingRows.push({m:ml[0], d:x.sched.aug_d, q:x.sched.aug_q});
    if(x.sched.sep_q>0) incomingRows.push({m:ml[1], d:x.sched.sep_d, q:x.sched.sep_q});
    if(x.sched.oct_q>0) incomingRows.push({m:ml[2], d:x.sched.oct_d, q:x.sched.oct_q});
  }
  return {customers, details, incomingRows, months:x.profileMonths||[], monthTotals:x.monthTotals||[]};
}

/* 거래처별 보기: 거래처마다 최근 12개월에 산 품목 수와, 그중 부족 수량이 있는 품목 수 (수량은 품목 기준이라 합치지 않음) */
export function customerShortRows(){
  const cut = new Date(); cut.setFullYear(cut.getFullYear()-1);
  const by = new Map();
  state.forecast.forEach(x=>{
    if(!brandPasses(x.brand)) return;
    const seen = new Map();
    (state.salesRowsByProduct.get(x.품번)||[]).forEach(r=>{ if(r.실적일자>=cut && r.수량>0 && r.거래처){ const d = seen.get(r.거래처); if(!d || r.실적일자>d) seen.set(r.거래처, r.실적일자); } });
    seen.forEach((last,cust)=>{
      let c = by.get(cust); if(!c){ c = {cust, items:0, short:0, last:null}; by.set(cust,c); }
      c.items++; if(x.orderQty>0 && x.grade!=='데이터부족') c.short++;
      if(!c.last || last>c.last) c.last = last;
    });
  });
  return Array.from(by.values()).sort((a,b)=>b.short-a.short || b.items-a.items || a.cust.localeCompare(b.cust,'ko'));
}

/* 기준 설정 · 비율 분포: 목표 대비 (가용+입고예정) 비율 구간별 품목 수 → 위험 기준(%)을 실제 분포로 정할 때 참고 */
export function coverageBands(){
  const bands = [['0~25%',0,25],['25~50%',25,50],['50~75%',50,75],['75~100%',75,100],['100% 이상',100,Infinity]].map(([label,lo,hi])=>({label,lo,hi,n:0}));
  let ref = 0;
  state.forecast.filter(x=>brandPasses(x.brand) && !x.hero).forEach(x=>{
    if(x.ratio===null || !Number.isFinite(x.ratio)){ ref++; return; }
    const r = Math.max(0, x.ratio); // 마이너스 재고는 가장 낮은 구간에 넣음
    bands.find(b=>r>=b.lo && r<b.hi).n++;
  });
  return {bands, ref};
}

/* addForecastPnTokens (1338행) / addPnTokens (1705행): 붙여넣은 품번을 칩으로 */
export function addForecastPnTokens(raw){
  const tokens = raw.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean);
  if(tokens.length===0) return;
  tokens.forEach(t=>ui.forecastPnChips.add(t));
  ui.forecastPage = 50;
}
export function addPnTokens(raw){
  const tokens = raw.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean);
  if(tokens.length===0) return;
  tokens.forEach(t=>ui.pnSelected.add(t));
  ui.customerPage=50;
}

/* renderSkuStatusSearchResults (1568행) */
export function skuSearchMatches(){
  const raw = ui.skuStatusSearch.trim();
  if(!raw) return null;
  const terms = raw.split(/[\n,]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  const matches = productList().filter(p=>{
    const pnL = p.pn.toLowerCase(), nameL = (p.name||'').toLowerCase();
    return terms.some(t=> pnL.includes(t) || nameL.includes(t));
  }).slice(0,80);
  ui.skuStatusLastMatches = matches.map(p=>p.pn);
  return matches;
}

/* renderSkuStatusTable (1596행) */
export function skuStatusModel(){
  const data = buildSkuStatusData(ui.skuStatusSelected);
  const {months, byCust, custList} = data;
  const monthTotals = months.map(mk => custList.reduce((s,c)=> s + (byCust.get(c).get(mk)||0), 0));
  const grandTotal = monthTotals.reduce((s,v)=>s+v,0);
  const rows = custList.map(c=>{
    const m = byCust.get(c);
    return {cust:c, values:months.map(mk=>m.get(mk)||0), total:months.reduce((s,mk)=>s+(m.get(mk)||0),0)};
  });
  return {...data, rows, monthTotals, grandTotal};
}

/* renderMselList (1676행): 거래처 / 품번 다중 선택 목록 */
export function mselItems(which){
  const isCust = which==='cust';
  const search = (isCust?ui.custMselSearch:ui.pnMselSearch).toLowerCase();
  let items = isCust
    ? state.customers.map(c=>({key:c,label:c}))
    : productList().map(p=>({key:p.pn,label:`${p.pn} · ${p.name}`}));
  if(search) items = items.filter(it=> it.label.toLowerCase().includes(search));
  return {total:items.length, items:items.slice(0,150)};
}

export function shortQuarter(q){ return q.replace(/^\d{2}(\d{2})/, '$1'); } // "2026 Q3" -> "26 Q3"

/* renderCustomerTable (1752행): 정렬된 피벗 행 (거래처 2개 이상이면 품번별로 묶음) */
export function customerTableModel(){
  const quarterCols = [...state.quarters].sort(); // ascending, oldest first
  const groupByCust = ui.custSelected.size > 1;
  let rows = buildPivotRows();
  if(ui.customerPnSearch){
    const s = ui.customerPnSearch.toLowerCase();
    rows = rows.filter(r=> r.품번.toLowerCase().includes(s) || (r.품명||'').toLowerCase().includes(s));
  }
  if(groupByCust){
    const productTotals = new Map();
    rows.forEach(r=>{ productTotals.set(r.품번, (productTotals.get(r.품번)||0)+r.total); });
    rows.sort((a,b)=>{
      const diff = productTotals.get(b.품번)-productTotals.get(a.품번);
      if(diff!==0) return diff;
      if(a.품번!==b.품번) return a.품번.localeCompare(b.품번);
      return b.total-a.total;
    });
  } else {
    rows.sort((a,b)=> b.total-a.total);
  }
  rows = rows.map(r=>({...r, available:usableAvailable(state.invByProduct.get(r.품번))}));
  return {quarterCols, groupByCust, rows};
}

/* 기준 설정 저장 버튼의 검사: 위험 기준(%)은 1~99 */
export function rulesValid(r){ return r.riskPct>=1 && r.riskPct<=99; }
export const RULES_INVALID_MSG = '생산 필요 기준은 1~99(%) 사이여야 합니다.';

/* 히어로 품목 추가 검사 (4100행). 통과하면 {pn, val}, 아니면 {error} */
export function heroInput(pnIn, minQty, warnQty){
  const found = state.forecast.find(x=>x.품번.toLowerCase()===pnIn.toLowerCase());
  if(!found) return {error:'해당 품번을 데이터에서 찾을 수 없습니다.'};
  if(!(minQty>0)) return {error:'생산 필요 수량을 입력해 주세요.'};
  if(warnQty && warnQty<=minQty) return {error:'생산 추천 수량은 생산 필요 수량보다 커야 합니다.'};
  return {pn:found.품번, val:{minQty, warnQty}};
}

/* renderForecastRules 의 기준표 · 히어로 목록 */
export function rulesModel(){
  const R = getRules();
  const fm = new Map((state.forecast||[]).map(x=>[x.품번,x]));
  const heroRows = Object.keys(settings.hero).sort().map(pn=>({pn, h:settings.hero[pn], x:fm.get(pn)}));
  return {R, heroRows, alertN:(state.heroAlerts||[]).length};
}


/* renderSyncStatus (1158행): 머리글의 데이터 상태 문구 */
export function syncStatusText(shared){
  if(state.error) return '파일 처리 오류';
  if(state.lastSync){
    if(shared.active && shared.meta && shared.meta.lastUpdate){
      const lu = shared.meta.lastUpdate;
      return '최신 데이터 ' + new Date(lu.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) + ' · ' + lu.by;
    }
    const label = state.fetchMode==='googlesheet' ? '구글시트 새로고침' : '마지막 업로드';
    return label + ' ' + state.lastSync.toLocaleTimeString('ko-KR');
  }
  return '업로드된 데이터 없음';
}

/* renderMetaLine (1177행) */
export function metaLineText(){
  if(!state.loaded) return '파일을 업로드해주세요.';
  const ts = state.lastSync ? state.lastSync.toLocaleString('ko-KR') : '-';
  return `[${ui.team}] ${metaSummaryText()} · 마지막 업로드 ${ts}`;
}
/** 머리글에 보이는 요약: metaLineText 에서 팀 · 마지막 업로드를 뺀 것 (둘 다 머리글의 팀 선택 · 데이터 상태에 이미 보임) */
export function metaSummaryText(){
  if(!state.loaded) return '파일을 업로드해주세요.';
  const pnCount = state.forecast.length;
  const custCount = state.customers.length;
  const salesCount = state.sales.length;
  return `품목 ${fmt(pnCount)}개 · 거래처 ${fmt(custCount)}곳 · 판매실적 ${fmt(salesCount)}건${salesCount===0?' (이 팀의 판매 파일이 아직 없습니다)':''}`;
}

/* ---------- 개요 → 발주 현황 연결 (새 화면 기능, 계산은 기존 등급 그대로) ---------- */
/** 발주 현황 상태 칩과 같은 기준: '조치필요' = 긴급·위험·주의, 그 밖에는 groupOf 의 4단계 */
export function inSignal(x, grade){
  return grade==='조치필요' ? (x.grade==='긴급' || x.grade==='위험' || x.grade==='주의') : groupOf(x.grade)===grade;
}
/** 개요의 '지금 발주할 품목': 발주 현황 '발주 필요(위험+주의)' 와 같은 품목 · 같은 순서 (state.forecast 정렬 그대로) */
export function urgentItems(){
  return state.forecast.filter(x=>brandPasses(x.brand) && inSignal(x, '조치필요'));
}

/** 거래처별 표의 판매 합계 행: 필터된 모든 행(더 보기로 아직 안 보인 행 포함).
 *  행마다 다른 (품번[, 거래처]) 의 판매라 겹치지 않음. 가용재고는 서로 다른 품목을 더하면 의미가 없어서 합계를 내지 않음 */
export function customerTotals(m){
  const quarters = new Map();
  let total = 0;
  m.rows.forEach(r=>{
    r.quarters.forEach((v,q)=>quarters.set(q, (quarters.get(q)||0)+v));
    total += r.total;
  });
  return {quarters, total};
}

/* ---------- 판매 표의 기간 열: 빠진 기간 · 진행 중인 기간 (표시용, 계산은 그대로) ---------- */
// 기간 키: 품목별 'YYYY-MM', 거래처별 'YYYY Qn' (quarterLabel)
const periodOrd = k => { const m = /^(\d{4})(?:-(\d{2})| Q(\d))$/.exec(k); return m[2] ? +m[1]*12 + +m[2] - 1 : +m[1]*4 + +m[3] - 1; };
/** 각 열 앞에 빠진 기간 수: 데이터 전체에 판매 기록이 하나도 없어서 열이 없는 달(분기) */
export function periodGaps(keys){
  return keys.map((k,i)=> i===0 ? 0 : periodOrd(k) - periodOrd(keys[i-1]) - 1);
}
/** 아직 끝나지 않은 이번 달(분기)인지: 판매가 계속 늘어나는 중 */
export function isCurrentPeriod(k){
  const now = new Date();
  return k.includes('Q') ? k===quarterLabel(now) : k===`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

/* applyUploadedData 의 완료 문구 (3646행) */
export function uploadDoneText({updatedList, reusedList}){
  return `업데이트 완료 — 새로 반영: ${updatedList.join(', ')||'없음'}${reusedList.length?` · 이전 데이터 그대로 유지: ${reusedList.join(', ')}`:''}. 좌측 메뉴에서 전체 개요를 확인하세요.`; // port: 운영 문구는 'Main을' (예전 탭 이름) — 새 메뉴 이름으로 바꿈
}

/* renderHeroAlerts (4025행): 개요 · 발주 현황 위쪽의 히어로 품목 위험 알람. 알람이 없으면 null (heroMissing 은 기존에도 표시하지 않음) */
export function heroAlertModel(){
  const list = state.heroAlerts || [];
  if(list.length===0) return null;
  return {count:list.length, team:ui.team, items:list.slice(0,12), more:list.length>12 ? list.length-12 : 0};
}

/* warehouseTableHtml (2049행) 의 데이터 부분: 창고별 가용재고 (+ 출고목록에 담겼는지). 재고 행이 없으면 '재고없음' 한 줄 */
export function warehouseRows(pn){
  const invRows = state.invByProduct.get(pn);
  if(!invRows || invRows.rows.length===0){
    return {rows:[{창고:'재고없음', 가용재고:0, 현재고:0, 입고예정:0, 출고예정:0, picked:ui.exportList.some(x=>x.key===pn+'||재고없음')}], total:null};
  }
  return {rows:invRows.rows.map(r=>({...r, picked:ui.exportList.some(x=>x.key===pn+'||'+r.창고)})), total:invRows.total};
}

/* ---------------- 바코드 · 거래처 조회 (renderLookupBatch 2360행 · renderResultBlock 2251행) ---------------- */
/* expiryTableHtml (2084행) 의 데이터 부분: 2년 이상 남은 LOT 이 있으면 그것만(유통기한 짧은 순), 없으면 전부(긴 순) + 주의 표시. LOT 이 없으면 null */
export function expiryRows(pn){
  const all = (state.expiryByProduct.get(pn)||[]).filter(e=>e.가용재고수량>0);
  if(all.length===0) return null;
  const now = new Date();
  const twoYearsOut = new Date(now); twoYearsOut.setFullYear(twoYearsOut.getFullYear()+2);
  const safe = all.filter(e=> e.유통기한 && e.유통기한>=twoYearsOut).sort((a,b)=>a.유통기한-b.유통기한);
  const risky = all.filter(e=> !(e.유통기한 && e.유통기한>=twoYearsOut)).sort((a,b)=>{
    if(!a.유통기한) return 1; if(!b.유통기한) return -1;
    return b.유통기한-a.유통기한;
  });
  const list = safe.length>0 ? safe : risky;
  return {warn: safe.length===0, rows: list.map(e=>{
    const lot = e.LOT||'-', date = e.유통기한Str||'-';
    return {lot, date, avail:e.가용재고수량, picked: ui.expiryList.some(x=>x.key===pn+'||EXP||'+lot+'||'+date)};
  })};
}

/* incomingChipsHtml (2108행) 의 데이터 부분: 제품일정표 3개월 중 수량이 있는 달 */
export function incomingChips(prod){
  const ml = state.scheduleMonthLabels;
  const chips = [];
  if(prod.aug_q>0) chips.push({m:ml[0], d:prod.aug_d, q:prod.aug_q});
  if(prod.sep_q>0) chips.push({m:ml[1], d:prod.sep_d, q:prod.sep_q});
  if(prod.oct_q>0) chips.push({m:ml[2], d:prod.oct_d, q:prod.oct_q});
  return chips.map(c=>({...c, picked: ui.incomingList.some(x=>x.key===prod.품번+'||'+c.m)}));
}

/* productMasterHtml (2211행): 박스 · 중량. 파일에 값이 있으면 고정 표시, 없으면 직접 입력(manual) */
export function boxModel(pn){
  const m = state.masterByProduct.get(pn) || {};
  const manual = ui.manualBoxInfo.get(pn) || {};
  const rows = [
    {label:'아웃박스', prefix:'아웃', weightField:'아웃무게g', countField:'아웃입수'},
    {label:'인박스', prefix:'인', weightField:'인무게g', countField:'인입수'},
    {label:'제품', prefix:'제품', weightField:'제품무게g', countField:null},
  ].map(r=>{
    const mw = m[r.prefix+'W'], md = m[r.prefix+'D'], mh = m[r.prefix+'H'];
    const cell = f => (m[f] ? {fixed:fmt(m[f])} : {field:f, value:manual[f]||null});
    return {
      label:r.label,
      dims: (mw||md||mh) ? {fixed:`${fmt(mw||0)}×${fmt(md||0)}×${fmt(mh||0)}`}
        : {fields:['W','D','H'].map(k=>({field:r.prefix+k, value:manual[r.prefix+k]||null, placeholder:k}))},
      weight: cell(r.weightField),
      count: r.countField ? cell(r.countField) : null,
    };
  });
  const plt = (m.PLT박스수||m.PLT입수||m.PLT무게kg||m.PLT단수) ? {
    kind: m.입고PLT종류||'',
    cells: [
      ['1단 박스수', m.PLT1단?fmt(m.PLT1단):'-'], ['단수', m.PLT단수?fmt(m.PLT단수):'-'],
      ['총 높이', m.PLT총높이cm?fmt(m.PLT총높이cm)+'cm':'-'], ['PLT당 박스수', m.PLT박스수?fmt(m.PLT박스수):'-'],
      ['PLT당 입수', m.PLT입수?fmt(m.PLT입수):'-'], ['PLT 무게', m.PLT무게kg?fmt(m.PLT무게kg)+'kg':'-'],
    ],
  } : null;
  return {rows, plt};
}

/* productMasterHtml(compact) : 대체 품번 카드의 읽기 전용 요약 (boxInfoFor = 직접 입력값 우선) */
export function boxCompactRows(pn){
  const box = boxInfoFor(pn);
  const dims = (w,d,h) => (w||d||h) ? `${fmt(w)}×${fmt(d)}×${fmt(h)}` : null;
  return [
    {label:'아웃박스', dim:dims(box.아웃W,box.아웃D,box.아웃H), weight:box.아웃무게g},
    {label:'인박스', dim:dims(box.인W,box.인D,box.인H), weight:box.인무게g},
    {label:'제품', dim:dims(box.제품W,box.제품D,box.제품H), weight:box.제품무게g},
  ].map(r=>({label:r.label, dim:r.dim, weight: r.dim ? (r.weight?fmt(r.weight):'-') : null}));
}

/* ---------------- 다운로드 목록 (renderExportPanel 2680행) ---------------- */
/* 열 순서 · 기본 너비 (EXPORT_COL_DEFAULTS 2143행). 'maxBoxes' 는 혼적 O 일 때 없음 */
export const EXPORT_COLS = [
  ['del',''],['pn','품번'],['name','품명'],['erpBarcode','ERP 바코드'],['barcode','바코드'],
  ['warehouse','창고'],['priority','우선순위'],['avail','가용재고'],['alloc','할당수량'],['needed','필요수량'],['diff','부족/여유'],['vendor','거래처(제조사)'],
  ['incDate','입고예정 일자'],['incQty','입고예정 수량'],
  ['lot','LOT'],['expiry','유통기한'],['expiryQty','유통기한 가용재고'],
  ['outDims','아웃박스 규격(mm)'],['outWeight','아웃박스 무게(g)'],['outCount','아웃박스 입수'],['inDims','인박스 규격(mm)'],['inWeight','인박스 무게(g)'],['inCount','인박스 입수'],['prodDims','제품 규격(mm)'],['prodWeight','제품 무게(g)'],
  ['boxesNeeded','예상 총 박스수'],['remainder','잔량(마지막 박스)'],['totalWeight','예상 총 박스중량(kg)'],['actualBoxes','PLT당 박스수'],['maxBoxes','PLT 최대 적재 가능 박스수'],['pltNumber','PLT 번호'],['pltWeight','PLT 예상중량(kg)'],['pltDims','PLT 예상 W×D×H(cm)'],
];
export const EXPORT_COL_DEFAULTS = {
  del:76, pn:90, name:190, erpBarcode:150, barcode:130, warehouse:150, priority:80, avail:90, alloc:90,
  needed:90, diff:90, vendor:130, incDate:110, incQty:100, lot:110, expiry:100, expiryQty:120,
  // port: 규격 칸은 W · D · H 입력칸 3개가 들어가게 130 → 200 (기존은 입력칸이 칸 밖으로 넘침)
  outDims:200, outWeight:100, outCount:80, inDims:200, inWeight:100, inCount:80,
  prodDims:200, prodWeight:100, boxesNeeded:100, remainder:130, totalWeight:130,
  actualBoxes:100, maxBoxes:150, pltNumber:90, pltWeight:120, pltDims:150,
};
export function exportColWidth(key){ return ui.exportColWidths[key] || EXPORT_COL_DEFAULTS[key] || 120; }

export function exportPanelModel(){
  const rows = buildExportRows();
  const mixed = ui.pltMixMode==='O';
  const pltTotal = mixed && ui.exportPltMixedTotal!==null
    ? ui.exportPltMixedTotal
    : Array.from(new Set(rows.map(r=>r.품번))).reduce((s,pn)=> s + (ui.exportPltByProduct.get(pn)||0), 0);
  let summary = null;
  if(pltTotal>0){
    const boxWeightTotal = Array.from(ui.exportPltDetail.values()).reduce((s,d)=>s+d.totalWeightKg,0);
    const tareKg = ui.exportPltTareKg || 20;
    const pltTareTotal = pltTotal * tareKg;
    summary = {
      pltLabel: mixed ? '혼적 기준 총 예상 PLT' : '품목별 개별 계산 기준 총 예상 PLT',
      pltTotal, boxWeightTotal, tareKg, pltTareTotal, grandTotal: boxWeightTotal + pltTareTotal, baseHeightCm: ui.exportPltBaseHeightCm||0,
    };
  }
  const box = pn => boxModel(pn).rows; // 아웃 · 인 · 제품 (편집 가능 여부 포함)
  const out = rows.map(x=>{
    const isRealWh = !x.isSynthetic && x.창고 && x.창고!=='재고없음';
    const needed = x._needed||0, diff = x._diff;
    const detail = ui.exportPltDetail.get(x.품번);
    let pltNumber = '-', pltWeight = '-', pltDims = '-';
    if(mixed){
      const nums = ui.exportPltNumbersByProduct.get(x.품번);
      if(nums && nums.length>0) pltNumber = nums.map(n=>'PLT '+n).join(', ');
      const weights = ui.exportPltRepWeightByProduct.get(x.품번);
      if(weights && weights.length>0) pltWeight = weights.map(w=>fmt(w)+' kg').join(', ');
      const dimsArr = ui.exportPltRepDimsByProduct.get(x.품번);
      if(dimsArr && dimsArr.length>0) pltDims = dimsArr.map(d=>`${fmt(d.L)}×${fmt(d.W)}×${fmt(d.H)}`).join(', ');
    } else if(ui.exportPltByProduct.has(x.품번)){
      pltNumber = fmt(ui.exportPltByProduct.get(x.품번)) + ' PLT';
      pltWeight = detail && detail.weightPerPltKg ? fmt(detail.weightPerPltKg)+' kg' : '-';
      pltDims = detail ? `${fmt(detail.palletL)}×${fmt(detail.palletW)}×${fmt(detail.actualHeightCm)}` : '-';
    }
    const b = box(x.품번);
    return {
      key: x.key,
      // 삭제: LOT 으로 늘어난 행 · LOT 만 고른 품목은 그 LOT 을, 창고 행은 창고를 뺌. 입고예정만 고른 품목은 입고예정 칸의 × 로
      del: (x._isExpiryClone || (x.isSynthetic && x._expiry)) ? {kind:'expiry', key:x._expiry.key} : (!x.isSynthetic ? {kind:'export', key:x.key} : null),
      pn: x.품번, name: x.품명, erpBarcode: x.바코드, barcode: baseBarcode(x.바코드), warehouse: x.창고,
      priority: isRealWh ? {key:x.key, value:x.우선순위||1} : null,
      avail: x.가용재고==='-' ? '-' : fmt(x.가용재고),
      alloc: isRealWh ? fmt(x._allocated||0) : '-',
      diff: (needed>0 && diff!==undefined) ? {text:`${diff<0?'':'+'}${fmt(diff)}개`, short: diff<0} : null,
      vendor: x.거래처||'-',
      inc: incomingItemsFor(x.품번).map(i=>({key:i.key, date: i.날짜?shortDate(i.날짜):'날짜 미정'})),
      incQty: incomingItemsFor(x.품번).map(i=>fmt(i.수량)).join(', ') || '-',
      lot: x._expiry ? {text:x._expiry.LOT, key:x._expiry.key} : null,
      expiry: x._expiry ? x._expiry.유통기한 : '-',
      expiryQty: x._expiry ? fmt(x._expiry.가용재고수량) : '-',
      outDims: b[0].dims, outWeight: b[0].weight, outCount: b[0].count,
      inDims: b[1].dims, inWeight: b[1].weight, inCount: b[1].count,
      prodDims: b[2].dims, prodWeight: b[2].weight,
      boxesNeeded: detail ? fmt(detail.boxesNeeded) : '-',
      remainder: detail ? (detail.remainderUnits>0 ? {text:`${fmt(detail.remainderUnits)}개 / ${fmt(detail.perBox)}개`, warn:true} : {text:'딱 맞음', muted:true}) : {text:'-'},
      totalWeight: detail && detail.totalWeightKg ? fmt(detail.totalWeightKg)+' kg' : '-',
      actualBoxes: detail ? fmt(detail.actualBoxesPerPallet) : '-',
      maxBoxes: detail ? fmt(detail.boxesPerPallet) : '-',
      pltNumber, pltWeight, pltDims,
    };
  });
  return {
    rows: out, mixed, summary,
    cols: EXPORT_COLS.filter(([k])=>!(mixed && k==='maxBoxes')),
    packing: mixed && ui.exportPltPacking && ui.exportPltPacking.length>0
      ? ui.exportPltPacking.map(p=>({index:p.index, items:p.items.map(it=>({pn:it.pn, pct:Math.round(it.frac*100)})), used:Math.round(p.used*100), full:p.used>0.98, weight:fmt(p.weightKg)}))
      : null,
  };
}


/* ---------------- 공유 저장본 검사 · 동기화 안내 (새 기능: 운영 화면에는 없음) ---------------- */
/** 받은 저장본({탭 이름: 행들})이 앱이 필수로 보는 시트(가용재고 · 판매실적)를 내용과 함께 갖췄는지. 문제 없으면 '' */
export function snapshotProblem(data){
  const n = {};
  Object.values(data||{}).forEach(rows=>{
    const t = detectSheetType(rows); if(!t) return;
    const h = findHeaderRow(rows, SHEET_SIGNATURES.find(s=>s.key===t).must);
    n[t] = (n[t]||0) + Math.max(0, rows.length - h.idx - 1);
  });
  const missing = SHEET_SIGNATURES.filter(s=>s.required && !n[s.key]).map(s=>s.label);
  return missing.length ? `필수 시트 내용이 없거나 인식되지 않음: ${missing.join(', ')}` : '';
}
const STALE_HOURS = 36;
/** 상단에 알릴 동기화 상태: problem(최근 업로드를 반영하지 못함) · stale(데이터가 오래됨) */
export function syncNotice(meta, now = Date.now()){
  const m = meta || {};
  const pr = m.problem || {};
  const why = (pr.snapshot && pr.snapshot.msg) || (pr.bundle && (pr.bundle.file ? `${pr.bundle.file}: ` : '') + pr.bundle.msg) || '';
  const at = m.lastUpdate && m.lastUpdate.at;
  const hours = at ? Math.floor((now - at) / 3600000) : null;
  return {
    problem: why ? `최근 업로드를 반영하지 못했습니다 (${why}). 이전 정상 데이터를 보여 주고 있습니다. 파일을 확인해 다시 올려 주세요.` : null,
    stale: hours !== null && hours >= STALE_HOURS ? `데이터가 ${hours >= 48 ? Math.floor(hours / 24) + '일' : hours + '시간'} 전에 업데이트된 것입니다. 최신 ERP 엑셀을 업로드 폴더에 올렸는지 확인해 주세요.` : null,
  };
}

/**
 * 수동 업로드 적용 전 검사 (새 기능). errors 가 있으면 적용 불가, warnings 는 확인 후 적용.
 * files: unresolvedFiles ({fileName, rows, key, error}). 계산 · 파싱 규칙은 바꾸지 않고, 잘못된 파일이 정상 데이터를 덮는 것만 막음.
 */
export function uploadChecks(files){
  const errors = [], warnings = [];
  (files||[]).forEach(f=>{
    if(f.error || !f.rows || !f.key) return;
    const sig = SHEET_SIGNATURES.find(s=>s.key===f.key);
    const h = findHeaderRow(f.rows, sig.must);
    if(!h){ errors.push(`${f.fileName}: 고른 시트 종류(${sig.label})의 머리글을 찾을 수 없습니다`); return; }
    const n = f.rows.length - h.idx - 1;
    if(n < 1){ errors.push(`${f.fileName}: 데이터 행이 없습니다 (머리글만 있음)`); return; }
    let cur;
    if(f.key === 'sales'){
      const nm = teamFromName(f.fileName), rw = teamFromRows(f.rows);
      if(nm && rw && nm !== rw){ errors.push(`${f.fileName}: 파일 이름은 ${nm} 인데 내용(부서)은 ${rw} 입니다`); return; }
      cur = ((state.salesByTeam||{})[nm || rw || 'B2B1팀'] || []).length;
    } else cur = (state[f.key] || []).length;
    if(cur >= 20 && n < cur * 0.5) warnings.push(`${f.fileName}: 행 수가 현재 ${fmt(cur)} → ${fmt(n)} 로 크게 줄었습니다`);
  });
  return {errors, warnings};
}
