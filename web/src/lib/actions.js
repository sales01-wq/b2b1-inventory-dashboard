// 기존 index.html 의 버튼 · 입력 처리(addEventListener 안쪽)에서 상태를 바꾸던 부분을 그대로 옮긴 것.
// 화면을 다시 그리던 render*() 호출 대신 emit() 을 부릅니다. actions.test.js 가 운영 화면을 직접 눌러 본 결과와 비교합니다.
import {state, ui, emit} from './store.js';
import {salesForTeam, computeDerived, brandPasses} from './forecast.js';
import {addPnTokens, addForecastPnTokens, inSignal} from './views.js';
import {doLookupBatch, addToExport, toggleIncoming, toggleExpiry, applyAutoSelectForItem, removeFromExport, removeIncoming, removeExpiry, calcExportPlt} from './lookup.js';
import {num} from './parse.js';

/* teamToggle 클릭 (3113행) */
export function setTeam(team){
  ui.team = team;
  try{ localStorage.setItem('inv_team', ui.team); }catch(_e){}
  ui.forecastPage = 50; ui.customerPage = 50; ui.forecastCustomers.clear();
  state.sales = salesForTeam();
  if(state.loaded){ computeDerived(); }
  emit();
}

/* brandToggle 클릭 (3132행) */
export function toggleBrand(b){
  if(ui.brandSelected.has(b)) ui.brandSelected.delete(b); else ui.brandSelected.add(b);
  ui.forecastPage = 50; ui.customerPage = 50;
  emit();
}

/* ---------- 판매 현황 · 거래처별 (3213~3321행) ---------- */
export function setCustMselSearch(v){ ui.custMselSearch = v; emit(); }
export function setPnMselSearch(v){ ui.pnMselSearch = v; emit(); }
export function setCustomerPnSearch(v){ ui.customerPnSearch = v; ui.customerPage=50; emit(); }
export function toggleCustomer(key, checked){
  if(checked) ui.custSelected.add(key); else ui.custSelected.delete(key);
  ui.customerPage=50; emit();
}
export function togglePn(key){
  if(ui.pnSelected.has(key)) ui.pnSelected.delete(key); else ui.pnSelected.add(key);
  ui.customerPage=50; emit();
}
export function removePnChip(key){ ui.pnSelected.delete(key); ui.customerPage=50; emit(); }
/** 품번 칸에서 Enter: 붙여넣은 품번들을 칩으로 추가 */
export function pnEnter(value){
  if(value.trim()){ addPnTokens(value); ui.pnMselSearch=''; }
  emit();
}
export function mselClear(which){
  (which==='cust'?ui.custSelected:ui.pnSelected).clear();
  ui.customerPage=50; emit();
}
export function customerMore(){ ui.customerPage+=50; emit(); }

/* ---------- 판매 현황 · 품목별 (3235~3286행) ---------- */
export function setSkuSearch(v){ ui.skuStatusSearch = v; emit(); }
/** 검색칸에서 Enter: 지금 검색 결과(skuSearchMatches 가 채운 목록)를 모두 선택하고 검색어를 비움 */
export function skuEnter(){
  if(ui.skuStatusLastMatches.length>0){
    ui.skuStatusLastMatches.forEach(pn=>ui.skuStatusSelected.add(pn));
  }
  ui.skuStatusSearch = '';
  emit();
}
export function pickAllSku(){ ui.skuStatusLastMatches.forEach(pn=>ui.skuStatusSelected.add(pn)); emit(); }
export function toggleSku(pn){
  if(ui.skuStatusSelected.has(pn)) ui.skuStatusSelected.delete(pn); else ui.skuStatusSelected.add(pn);
  emit();
}
export function clearSku(){ ui.skuStatusSelected = new Set(); emit(); }
export function removeSku(pn){ ui.skuStatusSelected.delete(pn); emit(); }

/* ---------- 발주 현황 (3141~3205행) ---------- */
export function setForecastGrade(v){ ui.forecastGrade=v; ui.forecastPage=50; emit(); }
export function setForecastBrand(v){ ui.forecastBrand=v; ui.forecastPage=50; emit(); }
/** 한 거래처만 고름 (거래처별 탭의 '품목 보기'). 빈 값 = 전체 */
export function setForecastCustomer(v){ ui.forecastCustomers.clear(); if(v) ui.forecastCustomers.add(v); ui.forecastPage=50; emit(); }
export function toggleForecastCustomer(c, on){ if(on) ui.forecastCustomers.add(c); else ui.forecastCustomers.delete(c); ui.forecastPage=50; emit(); }
export function clearForecastCustomers(){ ui.forecastCustomers.clear(); ui.forecastPage=50; emit(); }
export function setForecastCustSearch(v){ ui.forecastCustSearch=v; emit(); }
export function setForecastCategory(v){ ui.forecastCategory = v; ui.forecastPage=50; emit(); }
export function setForecastYear(y){ ui.forecastYear=y; emit(); }
/* 선택한 품목 (필터 · 탭을 바꿔도 유지, 다른 데이터가 들어오면 없는 품번은 자동으로 빠짐) */
export function toggleForecastSelect(pn){ if(ui.forecastSelected.has(pn)) ui.forecastSelected.delete(pn); else ui.forecastSelected.add(pn); emit(); }
export function setForecastSelectMany(pns, on){ pns.forEach(pn=>{ if(on) ui.forecastSelected.add(pn); else ui.forecastSelected.delete(pn); }); emit(); }
export function clearForecastSelect(){ ui.forecastSelected.clear(); emit(); }
export function setForecastSearch(v){ ui.forecastSearch=v; ui.forecastPage=50; emit(); }
export function setForecastShowNoSales(v){ ui.forecastShowNoSales=v; ui.forecastPage=50; emit(); }
export function setOverstockScope(v){ ui.forecastOverstockScope = v; emit(); }
export function forecastMore(){ ui.forecastPage+=50; emit(); }
export function toggleForecastDetail(pn){
  if(ui.forecastExpanded.has(pn)) ui.forecastExpanded.delete(pn); else ui.forecastExpanded.add(pn);
  emit();
}
/** 품번 칸에서 Enter: 입력이 있으면 칩으로 추가 (칸 비우기는 화면이 함) */
export function forecastPnEnter(value){ if(value.trim()){ addForecastPnTokens(value); } emit(); }
export function removeForecastPnChip(pn){ ui.forecastPnChips.delete(pn); emit(); }
export function clearForecastPnChips(){ ui.forecastPnChips.clear(); emit(); }
/** 개요의 신호 칸 · '전체 보기' → 발주 현황을 그 상태로 거름 (새 화면 기능).
 *  개요 숫자와 같은 품목이 보이도록 발주 현황의 다른 필터는 풀고, 그 상태에 판매 이력 없는 품목이 있으면 '판매 이력 없는 품목도 보기'를 켬 */
export function openForecastSignal(grade){
  ui.forecastGrade = grade; ui.forecastCustomers.clear(); ui.forecastCategory = 'all'; ui.forecastBrand = ''; ui.forecastSearch = ''; ui.forecastPnChips.clear(); ui.forecastPage = 50;
  if(state.forecast.some(x=>brandPasses(x.brand) && inSignal(x, grade) && x.sold6===0)) ui.forecastShowNoSales = true;
  emit();
}
export function setRulesOpen(open){ ui.rulesOpen = open; }

/* ---------------- 바코드 · 거래처 조회 (lookupForm / lookupResults 이벤트, 3326행~) ---------------- */
// port: 입력칸 글자는 화면을 옮겨도 남도록 ui 에 둠 (기존은 숨겨진 화면의 입력칸이 값을 들고 있었음)
ui.lookupBarcodeText = ''; ui.lookupNameText = ''; ui.lookupCustomerText = '';
export function setLookupText(field, v){ ui[field] = v; emit(); }
/** 조회 (submit). 데이터가 없으면 화면이 안내하므로 여기서는 바코드 · 품명 둘 다 비었을 때만 무시 */
export function lookupSearch(){
  const bc = ui.lookupBarcodeText.trim(), nq = ui.lookupNameText.trim(), cu = ui.lookupCustomerText.trim();
  if(!state.loaded || (!bc && !nq)) return;
  doLookupBatch(bc, nq, cu); emit();
}
/* 바코드 칸 '지우기': 바코드 입력과 조회 결과를 비움 (품명 · 거래처 입력은 그대로) */
export function clearLookupBarcode(){ ui.lookupBarcodeText = ''; ui.lookupItems = []; emit(); }
export function autoSelectOne(batchIdx){ applyAutoSelectForItem(ui.lookupItems[batchIdx]); emit(); }
export function autoSelectAll(){
  if(!ui.lookupItems || ui.lookupItems.length===0) return;
  ui.lookupItems.forEach(item=>applyAutoSelectForItem(item)); emit();
}
export function setAutoSelectAlternatives(v){ ui.autoSelectIncludeAlternatives = v; emit(); }
export function toggleCollapse(batchIdx){
  if(ui.collapsedItems.has(batchIdx)) ui.collapsedItems.delete(batchIdx); else ui.collapsedItems.add(batchIdx);
  emit();
}
export function toggleMasterInfo(pn){
  if(ui.masterInfoExpanded.has(pn)) ui.masterInfoExpanded.delete(pn); else ui.masterInfoExpanded.add(pn);
  emit();
}
export function toggleActiveProduct(batchIdx){ ui.activeBatchIdx = (ui.activeBatchIdx===batchIdx) ? null : batchIdx; emit(); }
/* 창고 행: 담기만 함 (이미 담긴 창고를 다시 눌러도 빠지지 않음 — 빼기는 다운로드 목록에서) */
// 기존은 값을 data-* 속성(글자)으로 넘겼으므로 같은 모양(null → '')으로 맞춤
const attr = v => String(v===null||v===undefined?'':v);
export function pickWarehouse(row, warehouse, avail){ addToExport(attr(row.품번), attr(row.품명), attr(row.바코드), attr(row.거래처), attr(warehouse), Number(avail)); emit(); }
export function pickIncoming(row, chip){ toggleIncoming(attr(row.품번), attr(row.품명), attr(row.바코드), attr(row.거래처), attr(chip.m), attr(chip.d||''), Number(chip.q)); emit(); }
export function pickExpiry(row, lot){ toggleExpiry(attr(row.품번), attr(row.품명), attr(row.바코드), attr(row.거래처), attr(lot.lot), attr(lot.date), Number(lot.avail)); emit(); }
/* 필요 수량: 0 이하 · 빈 값이면 지움 */
export function setNeededQty(pn, value){
  const v = num(value);
  if(v>0) ui.neededQty.set(pn, v); else ui.neededQty.delete(pn);
  emit();
}

/* ---------------- 다운로드 목록 (exportPanel 이벤트, 3473행) ---------------- */
export function removeExportRow(del){ if(del.kind==='expiry') removeExpiry(del.key); else removeFromExport(del.key); emit(); }
export function removeIncomingItem(key){ removeIncoming(key); emit(); }
export function removeExpiryItem(key){ removeExpiry(key); emit(); }
/* 우선순위: 빈 값 · 0 이면 1 */
export function setPriority(key, value){
  const v = num(value) || 1;
  const entry = ui.exportList.find(x=>x.key===key);
  if(entry) entry.우선순위 = v;
  emit();
}
/* 전체 지우기: 담은 창고 · 입고예정 · LOT 과 PLT 계산 결과 (필요 수량 · 박스 입력값은 그대로, 기존과 같음) */
export function clearExport(){
  ui.exportList=[]; ui.incomingList=[]; ui.expiryList=[];
  ui.exportPltByProduct=new Map(); ui.exportPltDetail=new Map(); ui.exportPltMixedTotal=null; ui.exportPltPacking=[];
  ui.exportPltNumbersByProduct=new Map(); ui.exportPltRepWeightByProduct=new Map(); ui.showPltPackingDetail=false;
  emit();
}
export function setExportColWidth(key, w){ ui.exportColWidths[key] = Math.max(40, Math.round(w)); emit(); }

/* ---------------- PLT 계산 · 혼적 상세 (calc-export-plt · toggle-plt-detail) ---------------- */
// port: 기존은 다시 그릴 때마다 입력칸이 기본값(110 · 110 · 150 · 15 · 20)으로 돌아갔음 → 입력한 값을 이 화면 동안 유지
ui.pltForm = {L:110, W:110, H:150, baseHeight:15, tare:20, mixMode:'X'};
export function setPltForm(field, v){ ui.pltForm[field] = v; emit(); }
/** PLT 계산: 입력칸 값(빈 칸은 기본값)과 혼적 선택으로 계산. 혼적 선택은 이 단추를 눌러야 반영 (기존과 같음) */
export function runPlt(){
  const f = ui.pltForm, s = v => (v===null||v===undefined ? '' : String(v));
  calcExportPlt({L:s(f.L), W:s(f.W), H:s(f.H), baseHeight:s(f.baseHeight), tare:s(f.tare), mixMode:f.mixMode});
  emit();
}
export function togglePltDetail(){ ui.showPltPackingDetail = !ui.showPltPackingDetail; emit(); }
