// 선택한 품목을 실제 .xlsx 로 내려받기 (여러 거래처 · 여러 품목). 고객별 판매는 고객 줄로 나누고,
// 재고 · 입고예정은 품목(그룹)당 한 번만 '요약' 시트에 두어 고객별로 더해질 수 있는 수치로 오해되지 않게 함.
import {state, ui} from './store.js';
import {scopeForecastItem, statusLabel, noSale3} from './forecast.js';
import {repsByCustomer} from './groupcalc.js';
import {findByKey, currentScopeLabel, cartStatusFor} from './insights.js';

const ymd = d => d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
const ym = m => `${m.y}-${String(m.m+1).padStart(2,'0')}`;

/** 선택한 항목(현재 거래처 범위로 계산, 화면 순서) */
export function selectedItems(){
  const order = new Map(state.forecast.map((x,i)=>[x.key||x.품번, i]));
  const seen = new Set(), out = [];
  [...ui.forecastSelected].forEach(k=>{
    const base = findByKey(k); if(!base) return;
    const x = scopeForecastItem(base, ui.forecastCustomers); const id = x.key||x.품번;
    if(seen.has(id)) return; seen.add(id); out.push(x);
  });
  return out.sort((a,b)=>(order.get(a.key||a.품번)??1e9)-(order.get(b.key||b.품번)??1e9));
}

/** {filename, sheets:[{name, widths, rows}]} — rows 첫 줄은 머리글, 값은 글자 · 숫자 */
export function buildSelectedExport(items = selectedItems()){
  const scope = currentScopeLabel();
  const custNames = ui.forecastCustomers.size>0 ? [...ui.forecastCustomers].join(', ') : '전체 거래처';
  const wk = [];
  const summary = [['선택 거래처 범위','품번(표시)','품명(전체)','구분','그룹 구성 SKU','대표 SKU','재고 기준 SKU','목표 재고','가용재고','유효 입고예정','부족 수량','부족 수량 상태','생산 필요 현황 상태','미판매 정보','마지막 판매일','3개월 미판매','발주 목록 포함','발주 목록 저장 수량','수동 수정','저장된 계산 기준','현재 범위와 같음']];
  const perCust = [['선택 거래처 범위','품번(표시)','품명(전체)','고객','이 고객의 최근 판매 SKU']];
  const totals = [['선택 거래처 범위','품번(표시)','품명(전체)']];
  const members = [['선택 거래처 범위','품번(표시)','멤버 SKU','멤버 품명','최근 판매실적일','가용재고','유효 입고예정','재고 반영','발주 목록 저장 수량']];
  let monthHead = null;
  items.forEach(x=>{
    const g = x.group, cart = cartStatusFor(x);
    const repLabel = g ? (g.pending ? 'SKU 선택 필요' : g.rep) : x.품번;
    const stockBasis = g ? (g.pending ? `임시 ${g.rep}` : [g.rep, ...g.compat].join(' + ')) : x.품번;
    summary.push([scope, x.품번, x.품명||'', g ? (g.auto ? '자동 그룹' : '수동 그룹') : '개별 SKU', g ? g.members.map(m=>m.pn).join(', ') : x.품번, repLabel, stockBasis,
      x.target, x.available, x.incoming, x.orderQty, g && g.pending ? '잠정 (SKU 미선택)' : '확정', statusLabel(x.grade), x.inactiveReason||'', ymd(x.lastSale), noSale3(x) ? '예' : '아니오',
      cart.length ? '포함' : '미포함', cart.map(c=>`${c.pn}:${c.qty}`).join(', '), cart.some(c=>c.edited) ? '예' : cart.length ? '아니오' : '', cart.map(c=>c.scope||'기준 정보 없음').join(' | '), cart.length ? (cart.every(c=>c.sameScope) ? '예' : '아니오') : '']);
    if(!monthHead){ monthHead = (x.profileMonths||[]).map(ym); perCust[0].push(...monthHead, '12개월 합계'); totals[0].push(...monthHead, '목표 재고(월 최대)', '목표 기준 월'); }
    const by = g ? repsByCustomer(x.memberPns, state.salesRowsBySku) : null;
    [...(x.byCustomer||new Map()).entries()].map(([c,a])=>({c, a, t:a.reduce((s,v)=>s+v,0)})).sort((p,q)=>q.t-p.t).forEach(({c,a,t})=>{
      const r = by && by.get(c); perCust.push([scope, x.품번, x.품명||'', c, g ? (r ? (r.pn || '동률') : '') : x.품번, ...a, t]);
    });
    totals.push([scope, x.품번, x.품명||'', ...(x.monthTotals||[]), x.target, x.peak ? ym(x.peak.month) : '']);
    const rows = g ? g.members : [{pn:x.품번, name:x.품명, lastSale:x.lastSale, available:x.available, incoming:x.incoming, isRep:true, compat:false}];
    rows.forEach(m=>{
      const inCart = ui.cart.has(m.pn) ? ui.cart.get(m.pn) : '';
      members.push([scope, x.품번, m.pn, m.name||'', ymd(m.lastSale), m.available, m.incoming, !g ? '개별 SKU' : m.isRep ? (g.pending ? '임시 대표(미확정)' : '대표 (재고 반영)') : m.compat ? '호환 확인 (재고 반영)' : '별도 (미반영)', inCart]);
    });
  });
  const info = [['안내'],
    [`선택 거래처 범위: ${custNames} (${scope})`],
    ['재고 · 입고예정은 품목(그룹)당 한 번만 "요약" 시트에 있습니다. 고객별 시트에는 판매만 있고, 재고 · 입고예정을 고객별로 나눈 값이 아닙니다.'],
    ['"그룹 멤버 SKU" 시트의 재고는 SKU 별 개별 수치이며 모두 더하지 마세요. 계산에는 "재고 반영"이 대표(+호환 확인) SKU 만 들어갑니다.'],
    ['부족 수량 상태가 "잠정"이면 대표 SKU 가 정해지지 않아 임시 SKU 재고로 계산한 값입니다.'],
    ['고객별 월 판매는 최근 12개월(이번 달 제외) 달력 월이며, 목표 재고는 선택 범위 합계의 월 최대입니다. 대표 SKU 는 최근 판매실적일 기준(실제 출하일 아님).'],
    [`내보낸 날짜: ${ymd(new Date())}`]];
  return {filename:`생산필요현황_선택품목_${ymd(new Date())}.xlsx`, sheets:[
    {name:'요약', widths:[22,12,36,10,28,14,24,10,10,12,10,16,14,16,12,10,10,16,8,28,12], rows:summary},
    {name:'고객별 월 판매', widths:[22,12,36,22,18,...Array(14).fill(9)], rows:perCust},
    {name:'월별 합계(목표 근거)', widths:[22,12,36,...Array(14).fill(9)], rows:totals},
    {name:'그룹 멤버 SKU', widths:[22,12,12,36,14,10,12,22,12], rows:members},
    {name:'안내', widths:[110], rows:info}]};
}

const cell = (v, bold) => v==null||v==='' ? null : typeof v==='number' && Number.isFinite(v) ? {value:v, type:Number, ...(bold?{fontWeight:'bold'}:{})} : {value:String(v), type:String, ...(bold?{fontWeight:'bold'}:{})};

/** 실제 .xlsx 파일(Blob) 만들기 — write-excel-file 은 내려받을 때만 불러옴(처음 화면 코드에 포함되지 않음) */
export async function selectedXlsxBlob(){
  const {default: writeXlsxFile} = await import('write-excel-file/browser');
  const ex = buildSelectedExport();
  const blob = await writeXlsxFile(ex.sheets.map(s=>({data:s.rows.map((r,i)=>r.map(v=>cell(v, i===0))), sheet:s.name, columns:s.widths.map(width=>({width})), stickyRowsCount:1}))).toBlob();
  return {blob, filename:ex.filename};
}
export async function downloadSelectedXlsx(){
  const {blob, filename} = await selectedXlsxBlob();
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  return filename;
}
