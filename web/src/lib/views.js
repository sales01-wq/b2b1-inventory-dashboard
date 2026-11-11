// 기존 render* 함수 안에 섞여 있던 계산 부분만 옮긴 것 (HTML 만드는 부분은 React 화면이 대신함).
// 식은 index.html 과 같게 유지합니다. 결과는 views.test.js 가 운영 화면에 그려진 값과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';
import {brandPasses, groupOf, scopedAvailable, salesDetailFor, nextOrderOf, usableAvailable, getRules, ruleThresholds} from './forecast.js';
import {custAdjust, custShortSummaryCached, productList, buildSkuStatusData, buildPivotRows} from './sales.js';

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
  let list = isOverstock
    ? state.forecast.filter(x=>brandPasses(x.brand) && x.sold6===0)
    : state.forecast.filter(x=>brandPasses(x.brand) && (ui.forecastShowNoSales || ui.forecastGrade==='참고' || x.sold6>0));

  // 거래처 필터: 그 거래처가 실제로 사간 품목만 남기고, 예상 분기수요/재고비율/추가발주/등급을 그 거래처 수요 기준으로 재계산
  if(ui.forecastCustomer){
    list = list.filter(x=> x.orderPattern && x.orderPattern.has(ui.forecastCustomer)).map(x=>{
      const cd = x.orderPattern.get(ui.forecastCustomer);
      const a = custAdjust(x, cd), avgQuarterly = cd.분기환산수량;
      const orderQty = a.short;
      return {...x, avgQuarterly, horizon:a.horizon, leadDemand:a.lead, nextOrder:a.next ? {...a.next, cust:ui.forecastCustomer} : null, bumped:a.bumped, ratio:a.ratio, orderQty, grade:a.grade, coverNow:a.coverNow, coverAll:a.coverAll, orderGap:a.orderGap, orderCount:cd.주문횟수, _customerScoped:true, _cd:cd};
    });
  }

  if(ui.forecastBrand) list = list.filter(x=>x.brand===ui.forecastBrand);
  const baseAll = state.forecast.filter(x=>brandPasses(x.brand));
  const brands = Array.from(new Set(baseAll.map(x=>x.brand))).filter(Boolean);
  const cnt = {위험:0,주의:0,여유:0,참고:0};
  list.forEach(x=>{ cnt[groupOf(x.grade)]++; });
  const gradeChips = [['조치필요','발주 필요 (위험+주의)',cnt.위험+cnt.주의],['위험','위험',cnt.위험],['주의','주의',cnt.주의],['여유','여유',cnt.여유],['참고','참고',cnt.참고],['','전체',list.length]];

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

  const months = []; { const n=new Date(); for(let k=5;k>=0;k--){ const d=new Date(n.getFullYear(), n.getMonth()-k, 1); months.push({y:d.getFullYear(), m:d.getMonth()}); } }
  const monthly = x=>{
    const arr = months.map(()=>0);
    (state.salesRowsByProduct.get(x.품번)||[]).forEach(r=>{
      if(ui.forecastCustomer && r.거래처!==ui.forecastCustomer) return;
      const d=r.실적일자; const idx = months.findIndex(mm=>mm.y===d.getFullYear() && mm.m===d.getMonth());
      if(idx>=0) arr[idx]+=r.수량;
    });
    return arr;
  };
  const topShort = custShortSummaryCached().filter(c=>c.shortItems>0).slice(0,8);
  return {list, isOverstock, brands, gradeChips, needItems, needQty, months, monthly, topShort};
}

/* forecastDetailRow (1284행): 펼친 행의 거래처별 발주 패턴 · 최근 판매 20건 · 입고예정 */
export function forecastDetail(x){
  const pattern = Array.from((x.orderPattern||new Map()).values()).sort((a,b)=>b.분기환산수량-a.분기환산수량)
    .map(p=>({...p, next:nextOrderOf(p)}));
  const details = salesDetailFor(x.품번).slice(0,20);
  const incomingRows = [];
  if(x.sched){
    const ml = state.scheduleMonthLabels;
    if(x.sched.aug_q>0) incomingRows.push({m:ml[0], d:x.sched.aug_d, q:x.sched.aug_q});
    if(x.sched.sep_q>0) incomingRows.push({m:ml[1], d:x.sched.sep_d, q:x.sched.sep_q});
    if(x.sched.oct_q>0) incomingRows.push({m:ml[2], d:x.sched.oct_d, q:x.sched.oct_q});
  }
  return {pattern, details, incomingRows};
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

/* 기준 설정 저장 버튼의 검사 (forecastRules 클릭 처리, 4085행) */
export function rulesValid(r){
  return r.leadDays>0 && r.urgentDays>0 && r.urgentDays<r.leadDays && r.cautionExtra>0 && r.safeExtra>r.cautionExtra && r.minOrders>=1 && r.dormantMonths>=0 && r.dormantMonths<=12;
}
export const RULES_INVALID_MSG = '긴급 기준은 리드타임보다 작아야 하고, 관찰 구간(리드타임+α)은 주의 구간보다 커야 합니다. 주문 횟수는 1 이상, 휴면 개월은 0~12여야 합니다.';

/* 히어로 품목 추가 검사 (4100행). 통과하면 {pn, val}, 아니면 {error} */
export function heroInput(pnIn, minQty, warnQty){
  const found = state.forecast.find(x=>x.품번.toLowerCase()===pnIn.toLowerCase());
  if(!found) return {error:'해당 품번을 데이터에서 찾을 수 없습니다.'};
  if(!(minQty>0)) return {error:'위험 수량을 입력해 주세요.'};
  if(warnQty && warnQty<=minQty) return {error:'주의 수량은 위험 수량보다 커야 합니다.'};
  return {pn:found.품번, val:{minQty, warnQty}};
}

/* renderForecastRules 의 기준표 · 히어로 목록 */
export function rulesModel(){
  const R = getRules(), T = ruleThresholds(R);
  const fm = new Map((state.forecast||[]).map(x=>[x.품번,x]));
  const heroRows = Object.keys(settings.hero).sort().map(pn=>({pn, h:settings.hero[pn], x:fm.get(pn)}));
  return {R, T, heroRows, alertN:(state.heroAlerts||[]).length};
}


/* 발주 현황 표의 "다음 주문" 설명 (renderForecast 의 noTxt2) */
export function forecastNextText(x){
  const no = x.nextOrder;
  return no ? (no.overdue ? `주문 예정일 지남 · 약 ${fmt(no.qty)}` : `다음 주문 ${no.date.getMonth()+1}/${no.date.getDate()} · 약 ${fmt(no.qty)}`) : (x.horizon>0 ? '최근 판매 기준 환산' : '');
}

/* 펼친 행의 "다음 예상 주문" (forecastDetailRow) */
export function patternNextText(n){
  return n ? (n.overdue ? `예정일 ${n.lateDays}일 지남` : `${n.date.getMonth()+1}/${n.date.getDate()}`) : '—';
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
  const pnCount = state.forecast.length;
  const custCount = state.customers.length;
  const salesCount = state.sales.length;
  const ts = state.lastSync ? state.lastSync.toLocaleString('ko-KR') : '-';
  return `[${ui.team}] 품목 ${fmt(pnCount)}개 · 거래처 ${fmt(custCount)}곳 · 판매실적 ${fmt(salesCount)}건${salesCount===0?' (이 팀의 판매 파일이 아직 없습니다)':''} · 마지막 업로드 ${ts}`;
}

/* applyUploadedData 의 완료 문구 (3646행) */
export function uploadDoneText({updatedList, reusedList}){
  return `업데이트 완료 — 새로 반영: ${updatedList.join(', ')||'없음'}${reusedList.length?` · 이전 데이터 그대로 유지: ${reusedList.join(', ')}`:''}. 좌측 메뉴에서 Main을 확인하세요.`;
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
