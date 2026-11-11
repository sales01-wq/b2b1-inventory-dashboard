// 기존 index.html 의 버튼 · 입력 처리(addEventListener 안쪽)에서 상태를 바꾸던 부분을 그대로 옮긴 것.
// 화면을 다시 그리던 render*() 호출 대신 emit() 을 부릅니다. actions.test.js 가 운영 화면을 직접 눌러 본 결과와 비교합니다.
import {state, ui, emit} from './store.js';
import {salesForTeam, computeDerived} from './forecast.js';
import {addPnTokens} from './views.js';

/* teamToggle 클릭 (3113행) */
export function setTeam(team){
  ui.team = team;
  try{ localStorage.setItem('inv_team', ui.team); }catch(_e){}
  ui.forecastPage = 50; ui.customerPage = 50; ui.forecastCustomer = '';
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
