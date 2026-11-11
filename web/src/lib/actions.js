// 기존 index.html 의 버튼 · 입력 처리(addEventListener 안쪽)에서 상태를 바꾸던 부분을 그대로 옮긴 것.
// 화면을 다시 그리던 render*() 호출 대신 emit() 을 부릅니다. actions.test.js 가 운영 화면을 직접 눌러 본 결과와 비교합니다.
import {state, ui, emit} from './store.js';
import {salesForTeam, computeDerived} from './forecast.js';

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
