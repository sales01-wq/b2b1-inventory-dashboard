// 상품 그룹 2단계: 사람이 확정한 그룹만 생산 필요 계산에 반영합니다 (후보 · 거절 · 그룹 없는 SKU 는 개별 계산 그대로).
//  - 판매: 그룹 멤버 전체의 판매 줄을 합쳐서(월별 합계) 목표 재고 · 마지막 판매일 · 미판매 규칙을 계산 (거래처 필터도 합친 줄에 그대로 적용)
//  - 재고 · 입고예정: 대표 SKU + 호환 확인한 멤버만, SKU 마다 한 번씩
//  - 대표 SKU: 수동 지정이 우선, 없으면 전체 거래처 기준 최근 판매실적일이 가장 늦은 SKU (거래처 필터와 무관하게 고정). 정할 수 없으면 그룹을 적용하지 않음
//  - 한 SKU 는 한 그룹에만: 둘 이상의 확정 그룹에 속한 SKU 가 있으면 순서와 상관없이 관련된 모든 그룹을 적용하지 않고(개별 SKU 계산 유지) 충돌로 알림
import {settings} from './store.js';
import {salesProfile, gradeFor, lastSaleInfo, safeNum} from './forecast.js';
import {suggestRep, validateMembers} from './skugroups.js';

const qty3Of = rows => { const c = new Date(); c.setMonth(c.getMonth()-3); return (rows||[]).reduce((s,r)=> (r.실적일자 instanceof Date && r.실적일자>=c && Number(r.수량)>0) ? s+Number(r.수량) : s, 0); };
const heroOf = pn => (settings.hero[pn] && settings.hero[pn].minQty>0) ? settings.hero[pn] : null;

/** items: 개별 SKU 항목, rowsBySku: 개별 판매 줄, eff: 그룹 대표 키를 합친 판매 줄로 바꿀 Map. → {items: 화면용 항목(그룹 = 한 줄), status: 그룹별 적용 여부 · 사유} */
export function applyConfirmedGroups(items, rowsBySku, eff){
  const groups = settings.skuGroups || {}, status = {};
  const byPn = new Map(items.map(x=>[x.품번, x]));
  const replace = new Map(), drop = new Set();
  // 충돌 감지: SKU → 속한 그룹들 (데이터에 있는지와 무관하게 설정 기준). 2개 이상이면 충돌 — 그룹 순서로 해결하지 않음
  const owners = new Map();
  Object.keys(groups).forEach(id=>new Set((groups[id]&&groups[id].members)||[]).forEach(pn=>{ if(!owners.has(pn)) owners.set(pn, []); owners.get(pn).push(id); }));
  const conflicts = [...owners.entries()].filter(([,ids])=>ids.length>1).map(([pn,ids])=>({pn, groups:ids.map(id=>({id, name:(groups[id]&&groups[id].name)||id}))})).sort((a,b)=>a.pn.localeCompare(b.pn));
  const conflicted = new Map(); // 그룹 id → 충돌 SKU 목록
  conflicts.forEach(c=>c.groups.forEach(g=>{ if(!conflicted.has(g.id)) conflicted.set(g.id, []); conflicted.get(g.id).push(c.pn); }));
  Object.keys(groups).sort().forEach(id=>{
    const g = groups[id] || {};
    if(conflicted.has(id)){ status[id] = {applied:false, conflict:true, reason:`SKU 충돌 — ${conflicted.get(id).join(', ')} 가 여러 그룹에 속해 있어 이 그룹은 적용하지 않고 개별 SKU 로 계산합니다 (그룹 구성을 고쳐 해결하세요)`}; return; }
    const present = (g.members||[]).filter(pn=>byPn.has(pn));
    if(present.length<2){ status[id] = {applied:false, reason:'현재 데이터에 있는 멤버가 2개 미만 — 개별 SKU 로 계산'}; return; }
    const v = validateMembers(present);
    if(!v.ok){ status[id] = {applied:false, reason:'묶을 수 없는 구성 — 개별 SKU 로 계산: '+v.errors[0]}; return; }
    const manual = g.rep && present.includes(g.rep) ? g.rep : null;
    const rep = manual || suggestRep(present.map(pn=>({pn, lastSale:byPn.get(pn).lastSale, qty3:qty3Of(rowsBySku.get(pn))}))).pn;
    if(!rep){ status[id] = {applied:false, reason:'대표 SKU 를 정할 수 없음 — 개별 SKU 로 계산 (그룹 관리에서 직접 지정)'}; return; }
    const compat = new Set((g.compat||[]).filter(pn=>present.includes(pn) && pn!==rep));
    const stockPns = [rep, ...compat]; // 재고 · 입고예정에 넣는 SKU (각각 한 번)
    const R = byPn.get(rep);
    const rows = present.flatMap(pn=>rowsBySku.get(pn)||[]); // 판매 줄은 한 SKU 에만 속하므로 겹치지 않음
    const prof = salesProfile(rows), act = lastSaleInfo(rows);
    const available = stockPns.reduce((s,pn)=>s+safeNum(byPn.get(pn).available), 0);
    const incoming = stockPns.reduce((s,pn)=>s+safeNum(byPn.get(pn).incoming), 0);
    const incomingExcluded = stockPns.reduce((s,pn)=>s+safeNum(byPn.get(pn).incomingExcluded), 0);
    const heroCfg = heroOf(rep) || present.map(heroOf).filter(Boolean).sort((a,b)=>b.minQty-a.minQty)[0] || null; // 히어로는 그룹 단위: 대표 설정 우선, 없으면 가장 큰 기준
    const discontinued = !!(R.discontinued && !heroCfg);
    const gr = discontinued || act.reason ? {grade:'데이터부족', ratio:null} : gradeFor({pn:rep, heroCfg, available, incoming, target:prof.target});
    const sold6 = present.reduce((s,pn)=>s+safeNum(byPn.get(pn).sold6), 0);
    const members = present.map(pn=>{ const x = byPn.get(pn); return {pn, name:x.품명, lastSale:x.lastSale||null, available:x.available, incoming:x.incoming, compat:compat.has(pn), isRep:pn===rep}; });
    replace.set(rep, {...R, group:{id, name:g.name||'', rep, repManual:!!manual, compat:[...compat], members, missing:(g.members||[]).filter(pn=>!present.includes(pn))}, memberPns:present,
      available, incoming, incomingExcluded, sold6, discontinued, lastSale:act.last, inactiveReason:act.reason, target:prof.target,
      orderQty: discontinued ? 0 : Math.max(0, prof.target - available - incoming), ratio:gr.ratio, grade:gr.grade,
      avgQuarterly:prof.total12/4, monthTotals:prof.totals, profileMonths:prof.months, returns:prof.returns, spike:prof.spike, peak:prof.peak, byCustomer:prof.byCust,
      hero:present.some(pn=>byPn.get(pn).hero), mask:present.some(pn=>byPn.get(pn).mask), heroCfg, heroMin:heroCfg?heroCfg.minQty:0, heroWarn:heroCfg?(heroCfg.warnQty||0):0});
    eff.set(rep, rows); // 거래처 필터 · 월별 열 · 고객별 보기가 합친 판매 줄을 씀
    present.forEach(pn=>{ if(pn!==rep) drop.add(pn); });
    status[id] = {applied:true, rep};
  });
  return {items: items.filter(x=>!drop.has(x.품번)).map(x=>replace.get(x.품번)||x), status, conflicts};
}
