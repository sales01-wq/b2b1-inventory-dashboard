// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
import {fmt} from './format';
import {state, ui} from './store.js';
import {num} from './parse.js';
import {brandOf, isUsableWarehouse} from './forecast.js';

/* ---------------- Lookup tool (multi-barcode) ---------------- */
export function baseBarcode(bc){
  return String(bc||'').trim().replace(/-\d+$/,'');
}

export function suffixNum(bc){
  const m = String(bc||'').match(/-(\d+)$/);
  return m ? parseInt(m[1],10) : 0;
}

export function alternativesFor(row){
  const base = baseBarcode(row.바코드);
  const group = state.schedule.filter(r=>baseBarcode(r.바코드)===base && brandOf(r.품번));
  return group.filter(s=>s.품번!==row.품번).sort((a,b)=> suffixNum(b.바코드)-suffixNum(a.바코드));
}

export function resolveBarcode(query, customer){
  const q = String(query||'').trim();
  const base = baseBarcode(q);
  let group = state.schedule.filter(r=>baseBarcode(r.바코드)===base && brandOf(r.품번));
  let matchedPn = null;

  if(group.length===0){
    // 바코드로 못 찾으면 품번(정확히 일치)으로도 시도
    const pnRow = state.schedule.find(r=> r.품번.toLowerCase()===q.toLowerCase() && brandOf(r.품번));
    if(pnRow){
      matchedPn = pnRow.품번;
      const realBase = baseBarcode(pnRow.바코드);
      group = state.schedule.filter(r=>baseBarcode(r.바코드)===realBase && brandOf(r.품번));
    }
  }

  if(group.length===0){
    return {barcode:q, status:'notfound'};
  }
  let pool = group;
  if(customer){
    const cLower = customer.toLowerCase();
    const filtered = group.filter(r=>r.거래처 && r.거래처.toLowerCase().includes(cLower));
    if(filtered.length>0) pool = filtered;
  }
  let matched;
  if(matchedPn){
    // 품번으로 입력한 경우 그 정확한 품번을 우선 매칭
    matched = pool.find(r=>r.품번.toLowerCase()===matchedPn.toLowerCase())
      || pool.slice().sort((a,b)=> suffixNum(b.바코드)-suffixNum(a.바코드))[0];
  } else {
    matched = pool.slice().sort((a,b)=> suffixNum(b.바코드)-suffixNum(a.바코드))[0];
  }
  const alternatives = group.filter(s=>s.품번!==matched.품번)
    .sort((a,b)=> suffixNum(b.바코드)-suffixNum(a.바코드));
  return {barcode:q, status:'resolved', row:matched, alternatives};
}

export function resolveNameMatches(term, customer){
  const t = term.toLowerCase();
  let matches = state.schedule.filter(r=> r.품명 && r.품명.toLowerCase().includes(t) && brandOf(r.품번));
  const seen = new Set();
  matches = matches.filter(r=>{ if(seen.has(r.품번)) return false; seen.add(r.품번); return true; });
  if(customer){
    const cLower = customer.toLowerCase();
    const filtered = matches.filter(r=>r.거래처 && r.거래처.toLowerCase().includes(cLower));
    if(filtered.length>0) matches = filtered;
  }
  return matches;
}

export function doLookupBatch(barcodesRaw, nameRaw, customer){
  ui.collapsedItems = new Set();
  const seen = new Set();
  const barcodes = [];
  const pastedQty = new Map(); // 원본 입력 토큰 -> 수량 (엑셀에서 바코드+수량 붙여넣은 경우)
  (barcodesRaw||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(line=>{
    // 탭(엑셀 붙여넣기)이든 그냥 스페이스로 직접 입력했든, 마지막 칸이 숫자면 수량으로 인식
    let tokens = line.split(/\t+|\s+/).map(s=>s.trim()).filter(Boolean);
    let qty = null;
    if(tokens.length>=2){
      const last = tokens[tokens.length-1].replace(/,/g,'');
      if(/^-?\d+(\.\d+)?$/.test(last)){
        qty = num(last);
        tokens = tokens.slice(0,-1);
      }
    }
    // 나머지는 쉼표로 구분된 여러 바코드/품번으로 처리 (수량이 있으면 각각에 동일 적용)
    tokens.join(' ').split(/,+/).map(s=>s.trim()).filter(Boolean).forEach(bc=>{
      if(!seen.has(bc)){
        seen.add(bc); barcodes.push(bc);
        if(qty!==null) pastedQty.set(bc, qty);
      }
    });
  });
  const barcodeItems = barcodes.map(bc=>{
    const item = resolveBarcode(bc, customer);
    if(item.status==='resolved' && pastedQty.has(bc)){
      ui.neededQty.set(item.row.품번, pastedQty.get(bc));
    }
    return item;
  });

  const seenNames = new Set();
  const nameTerms = (nameRaw||'').split(/[\n,]+/).map(s=>s.trim()).filter(s=>{
    if(!s || seenNames.has(s.toLowerCase())) return false;
    seenNames.add(s.toLowerCase()); return true;
  });
  const NAME_MATCH_CAP = 20;
  const nameItems = [];
  nameTerms.forEach(term=>{
    const matches = resolveNameMatches(term, customer);
    if(matches.length===0){
      nameItems.push({nameQuery:term, status:'notfound'});
      return;
    }
    matches.slice(0, NAME_MATCH_CAP).forEach(row=>{
      nameItems.push({nameQuery:term, status:'resolved', row, alternatives:alternativesFor(row)});
    });
    if(matches.length>NAME_MATCH_CAP){
      nameItems.push({nameQuery:term, status:'truncated', extra:matches.length-NAME_MATCH_CAP});
    }
  });

  ui.lookupItems = [...barcodeItems, ...nameItems];
}

export function selectionSummaryFor(pn){
  const wh = ui.exportList.filter(x=>x.품번===pn).length;
  const inc = ui.incomingList.filter(x=>x.품번===pn).length;
  const exp = ui.expiryList.filter(x=>x.품번===pn).length;
  const parts = [];
  if(wh>0) parts.push(`창고 ${wh}개`);
  if(inc>0) parts.push(`입고예정 ${inc}개`);
  if(exp>0) parts.push(`유통기한 ${exp}개`);
  return parts.length ? parts.join(' · ') : '선택된 항목 없음';
}

export function boxInfoFor(pn){
  const manual = ui.manualBoxInfo.get(pn) || {};
  const m = state.masterByProduct.get(pn) || {};
  return {
    아웃W: manual.아웃W || m.아웃W || 0,
    아웃D: manual.아웃D || m.아웃D || 0,
    아웃H: manual.아웃H || m.아웃H || 0,
    아웃무게g: manual.아웃무게g || m.아웃무게g || 0,
    아웃입수: manual.아웃입수 || m.아웃입수 || 0,
    인W: manual.인W || m.인W || 0,
    인D: manual.인D || m.인D || 0,
    인H: manual.인H || m.인H || 0,
    인무게g: manual.인무게g || m.인무게g || 0,
    인입수: manual.인입수 || m.인입수 || 0,
    제품W: manual.제품W || m.제품W || 0,
    제품D: manual.제품D || m.제품D || 0,
    제품H: manual.제품H || m.제품H || 0,
    제품무게g: manual.제품무게g || m.제품무게g || 0,
  };
}

export function addToExport(pn, name, barcode, vendor, warehouse, avail){
  if(!pn || !warehouse) return;
  const key = pn+'||'+warehouse;
  if(ui.exportList.some(x=>x.key===key)) return; // already added
  const priority = ui.exportList.filter(x=>x.품번===pn).length + 1;
  ui.exportList.push({
    key, 품번:pn, 품명:name, 바코드:barcode,
    창고:warehouse, 가용재고:avail, 거래처:vendor||'', 우선순위:priority
  });
}

export function removeFromExport(key){
  ui.exportList = ui.exportList.filter(x=>x.key!==key);
}

export function productNeedDiff(pn){
  const needed = ui.neededQty.get(pn) || 0;
  const rows = ui.exportList.filter(x=>x.품번===pn && x.창고 && x.창고!=='재고없음' && typeof x.가용재고==='number');
  const totalAvail = rows.reduce((s,r)=>s+r.가용재고,0);
  return {needed, totalAvail, diff: totalAvail-needed};
}

export function toggleIncoming(pn, name, barcode, vendor, monthLabel, date, qty){
  const key = pn+'||'+monthLabel;
  const idx = ui.incomingList.findIndex(x=>x.key===key);
  if(idx>=0){
    ui.incomingList.splice(idx,1);
  } else {
    ui.incomingList.push({key, 품번:pn, 품명:name, 바코드:barcode, 거래처:vendor||'', 월:monthLabel, 날짜:date||'', 수량:qty});
  }
}

export function removeIncoming(key){
  ui.incomingList = ui.incomingList.filter(x=>x.key!==key);
}

export function shortDate(dateStr){
  const s = String(dateStr||'').trim();
  const m = s.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
  if(m) return `${parseInt(m[1],10)}/${parseInt(m[2],10)}`;
  return s;
}

export function incomingItemsFor(pn){
  return ui.incomingList.filter(x=>x.품번===pn);
}

export function incomingDateText(pn){
  return incomingItemsFor(pn).map(x=>x.날짜?shortDate(x.날짜):'날짜미정').join(', ');
}

export function incomingQtyText(pn){
  return incomingItemsFor(pn).map(x=>fmt(x.수량)).join(', ');
}

export function toggleExpiry(pn, name, barcode, vendor, lot, dateStr, avail){
  const key = pn+'||EXP||'+lot+'||'+dateStr;
  const idx = ui.expiryList.findIndex(x=>x.key===key);
  if(idx>=0){
    ui.expiryList.splice(idx,1);
  } else {
    ui.expiryList.push({key, 품번:pn, 품명:name, 바코드:barcode, 거래처:vendor||'', LOT:lot, 유통기한:dateStr, 가용재고수량:avail});
  }
}

export function removeExpiry(key){
  ui.expiryList = ui.expiryList.filter(x=>x.key!==key);
}

export function pickRecommendedLot(pn){
  const expEntries = (state.expiryByProduct.get(pn)||[]).filter(e=>e.가용재고수량>0);
  if(expEntries.length===0) return null;
  const needed = ui.neededQty.get(pn) || 0;
  const now = new Date(); const twoYearsOut = new Date(now); twoYearsOut.setFullYear(twoYearsOut.getFullYear()+2);
  const isSafe = e => e.유통기한 && e.유통기한>=twoYearsOut;

  if(needed>0){
    // 1순위: 2년 이상 남았으면서 필요수량을 그 LOT 하나로 충족
    const safeEnough = expEntries.filter(e=>isSafe(e) && e.가용재고수량>=needed).sort((a,b)=>a.유통기한-b.유통기한);
    if(safeEnough.length>0) return safeEnough[0];
    // 2순위: 유통기한 상관없이 필요수량을 충족 (그 중에선 유통기한 긴 것 우선)
    const enoughAny = expEntries.filter(e=>e.가용재고수량>=needed).sort((a,b)=>{
      if(!a.유통기한) return 1; if(!b.유통기한) return -1;
      return b.유통기한-a.유통기한;
    });
    if(enoughAny.length>0) return enoughAny[0];
  }
  // 3순위(필요수량 미입력이거나, 단일 LOT으로는 충족 불가할 때의 기존 기준): 2년 이상 우선, 없으면 가장 긴 것
  const safe = expEntries.filter(isSafe).sort((a,b)=>a.유통기한-b.유통기한);
  const risky = expEntries.filter(e=>!isSafe(e)).sort((a,b)=>{
    if(!a.유통기한) return 1; if(!b.유통기한) return -1;
    return b.유통기한-a.유통기한;
  });
  return (safe.length>0 ? safe : risky)[0];
}

export function autoSelectRecommendedFor(pn, name, barcode, vendor){
  let addedWarehouse = false, addedLot = false;

  // 창고: 사용 가능한(선택한 팀/EMP) 창고 중 가용재고가 가장 많은 곳을 추천
  const invInfo = state.invByProduct.get(pn);
  if(invInfo && invInfo.rows.length>0){
    const usableRows = invInfo.rows.filter(r=>isUsableWarehouse(r.창고) && r.가용재고>0);
    const pool = usableRows.length>0 ? usableRows : invInfo.rows.filter(r=>r.가용재고>0);
    if(pool.length>0){
      const best = pool.slice().sort((a,b)=>b.가용재고-a.가용재고)[0];
      const key = pn+'||'+best.창고;
      if(!ui.exportList.some(x=>x.key===key)){
        const priority = ui.exportList.filter(x=>x.품번===pn).length + 1;
        ui.exportList.push({key, 품번:pn, 품명:name, 바코드:barcode, 창고:best.창고, 가용재고:best.가용재고, 거래처:vendor||'', 우선순위:priority});
        addedWarehouse = true;
      }
    }
  }

  // 유통기한(LOT): 필요수량을 고려한 추천 (2년 이상+충족 > 충족만 > 기존 기준)
  const top = pickRecommendedLot(pn);
  if(top){
    const key = pn+'||EXP||'+(top.LOT||'-')+'||'+(top.유통기한Str||'-');
    if(!ui.expiryList.some(x=>x.key===key)){
      ui.expiryList.push({key, 품번:pn, 품명:name, 바코드:barcode, 거래처:vendor||'', LOT:top.LOT, 유통기한:top.유통기한Str, 가용재고수량:top.가용재고수량});
      addedLot = true;
    }
  }

  // 담을 창고도, LOT도 없는 경우 (가용재고가 전혀 없는 품목) — 목록에서 조용히 빠지지 않도록 '재고없음'으로 표시
  if(!addedWarehouse && !addedLot && !ui.exportList.some(x=>x.품번===pn)){
    const key = pn+'||재고없음';
    const priority = ui.exportList.filter(x=>x.품번===pn).length + 1;
    ui.exportList.push({key, 품번:pn, 품명:name, 바코드:barcode, 창고:'재고없음', 가용재고:0, 거래처:vendor||'', 우선순위:priority});
  }

  return {addedWarehouse, addedLot};
}

export function applyAutoSelectForItem(item){
  if(!item || item.status!=='resolved' || !item.row) return;
  autoSelectRecommendedFor(item.row.품번, item.row.품명, item.row.바코드, item.row.거래처);
  if(ui.autoSelectIncludeAlternatives && item.alternatives && item.alternatives.length>0){
    item.alternatives.forEach(a=> autoSelectRecommendedFor(a.품번, a.품명, a.바코드, a.거래처));
  }
}

export function expiryItemsFor(pn){
  return ui.expiryList.filter(x=>x.품번===pn);
}

export function expiryLotText(pn){ return expiryItemsFor(pn).map(x=>x.LOT).join(' / '); }

export function expiryDateText(pn){ return expiryItemsFor(pn).map(x=>x.유통기한).join(' / '); }

export function expiryQtyText(pn){ return expiryItemsFor(pn).map(x=>fmt(x.가용재고수량)).join(' / '); }

export function masterFieldsFor(pn){
  const box = boxInfoFor(pn);
  const dims = (w,d,h) => (w||d||h) ? `${fmt(w)}×${fmt(d)}×${fmt(h)}` : '';
  return {
    아웃규격: dims(box.아웃W,box.아웃D,box.아웃H), 아웃무게: box.아웃무게g?fmt(box.아웃무게g):'', 아웃입수: box.아웃입수?fmt(box.아웃입수):'',
    인규격: dims(box.인W,box.인D,box.인H), 인무게: box.인무게g?fmt(box.인무게g):'', 인입수: box.인입수?fmt(box.인입수):'',
    제품규격: dims(box.제품W,box.제품D,box.제품H), 제품무게: box.제품무게g?fmt(box.제품무게g):'',
  };
}

/* ---------------- PLT 선적 계산 (다운로드 목록의 PLT계산 버튼에서 사용) ---------------- */
export function computePltForRow(query, qty, palletL, palletW, palletH){
  const resolved = resolveBarcode(query, '');
  if(resolved.status!=='resolved'){
    return {query, qty, status:'notfound'};
  }
  const row = resolved.row;
  const box = boxInfoFor(row.품번);
  if(!(box.아웃W && box.아웃D && box.아웃H)){
    return {query, qty, status:'no-master', 품번:row.품번, 품명:row.품명};
  }
  const boxL = box.아웃W/10, boxD = box.아웃D/10, boxH = box.아웃H/10; // mm -> cm
  const opt1 = Math.floor(palletL/boxL) * Math.floor(palletW/boxD);
  const opt2 = Math.floor(palletL/boxD) * Math.floor(palletW/boxL);
  const perLayer = Math.max(opt1, opt2, 0);
  const layers = boxH>0 ? Math.floor(palletH/boxH) : 0;
  const boxesPerPallet = perLayer * layers;

  const perBox = box.아웃입수 || 0;
  const qtyVal = qty || 0;
  const boxesNeeded = perBox>0 ? Math.ceil(qtyVal/perBox) : Math.ceil(qtyVal); // 아웃입수 없으면 수량=박스수로 취급
  const pltNeeded = boxesPerPallet>0 ? Math.ceil(boxesNeeded/boxesPerPallet) : null;
  // 잔량: 박스입수로 딱 안 나눠떨어질 때, 마지막 박스에 몇 개가 들어가는지
  const remainderUnits = perBox>0 ? (qtyVal % perBox) : 0; // 0이면 완전히 딱 맞음(잔량 박스 없음)

  return {
    query, qty:qtyVal, status:'ok', 품번:row.품번, 품명:row.품명,
    perBox, boxesNeeded, perLayer, layers, boxesPerPallet, pltNeeded, remainderUnits, boxH,
  };
}

export function buildExportRows(){
  const baseRows = ui.exportList.map(x=>({...x, isSynthetic:false}));
  const seenPn = new Set(ui.exportList.map(x=>x.품번));
  const extraPns = [...new Set([...ui.incomingList.map(x=>x.품번), ...ui.expiryList.map(x=>x.품번)])].filter(pn=>!seenPn.has(pn));
  extraPns.forEach(pn=>{
    const sample = ui.incomingList.find(x=>x.품번===pn) || ui.expiryList.find(x=>x.품번===pn);
    baseRows.push({key:'extra||'+pn, 품번:pn, 품명:sample.품명, 바코드:sample.바코드, 창고:'-', 가용재고:'-', 거래처:sample.거래처, isSynthetic:true});
  });

  // 품번별로 우선순위(1순위, 2순위...) 순서대로 필요수량을 순차 차감 배분
  const byProduct = new Map();
  baseRows.forEach(r=>{ if(!byProduct.has(r.품번)) byProduct.set(r.품번, []); byProduct.get(r.품번).push(r); });
  byProduct.forEach((rows, pn)=>{
    const needed = ui.neededQty.get(pn) || 0;
    const realRows = rows.filter(r=>!r.isSynthetic && r.창고 && r.창고!=='재고없음' && typeof r.가용재고==='number')
      .sort((a,b)=>(a.우선순위||999)-(b.우선순위||999));
    let remaining = needed;
    realRows.forEach(r=>{
      const alloc = Math.max(0, Math.min(remaining, r.가용재고));
      r._allocated = alloc;
      remaining -= alloc;
    });
    const totalAvail = realRows.reduce((s,r)=>s+r.가용재고,0);
    const diff = totalAvail - needed;
    rows.forEach(r=>{ r._needed = needed; r._diff = diff; });
  });

  // LOT/유통기한을 여러 개 선택한 경우, 앞의 내용은 그대로 두고 행을 새로 추가
  const rows = [];
  baseRows.forEach(r=>{
    const items = expiryItemsFor(r.품번);
    if(items.length===0){
      rows.push({...r, _expiry:null, _isExpiryClone:false});
    } else {
      items.forEach((it,idx)=>{
        rows.push({...r, key: idx===0?r.key:(r.key+'||exp'+idx), _expiry:it, _isExpiryClone: idx>0});
      });
    }
  });
  return rows;
}

export function packPalletsMixed(items, tareKg, palletL, palletW){
  // items: [{pn, 품명, frac, boxesPerPallet, weightPerBoxKg, perLayer, boxH}]
  const pallets = [];
  const fragments = [];
  items.forEach(it=>{
    const whole = Math.floor(it.frac + 1e-9);
    const rem = it.frac - whole;
    for(let i=0;i<whole;i++){
      pallets.push({items:[{pn:it.pn, 품명:it.품명, frac:1, boxesPerPallet:it.boxesPerPallet, weightPerBoxKg:it.weightPerBoxKg, perLayer:it.perLayer, boxH:it.boxH}], used:1});
    }
    if(rem>1e-6) fragments.push({pn:it.pn, 품명:it.품명, frac:rem, boxesPerPallet:it.boxesPerPallet, weightPerBoxKg:it.weightPerBoxKg, perLayer:it.perLayer, boxH:it.boxH});
  });
  fragments.sort((a,b)=>b.frac-a.frac); // First-Fit-Decreasing
  fragments.forEach(frag=>{
    let placed = false;
    for(const p of pallets){
      if(p.used<1-1e-9 && (1-p.used) >= frag.frac-1e-9){
        p.items.push(frag);
        p.used += frag.frac;
        placed = true;
        break;
      }
    }
    if(!placed) pallets.push({items:[frag], used:frag.frac});
  });
  pallets.forEach((p,i)=>{
    p.index = i+1;
    // 이 파레트에 실제로 실리는 각 품목의 박스 수 × 박스무게 를 더해서 실제 중량 계산 (+ 빈 PLT 자체무게)
    const productWeight = p.items.reduce((s,it)=> s + (it.frac * (it.boxesPerPallet||0) * (it.weightPerBoxKg||0)), 0);
    p.weightKg = productWeight + (tareKg||0);
    // 실제 규격: 가로/세로는 파레트 그대로, 높이는 품목별로 각자 몇 층 쌓이는지 더한 값 (품목별로 층을 나눠 쌓는다고 가정)
    const heightCm = p.items.reduce((s,it)=>{
      if(!it.perLayer || !it.boxH) return s;
      const boxesOnThisPallet = it.frac * (it.boxesPerPallet||0);
      const layersNeeded = Math.ceil(boxesOnThisPallet / it.perLayer - 1e-9);
      return s + layersNeeded*it.boxH;
    }, 0);
    p.dims = {L:palletL, W:palletW, H:Math.round(heightCm*10)/10};
  });
  return pallets;
}

// port: 화면 입력칸 값을 인자로 받음 (inputs = {L, W, H, baseHeight, tare, mixMode}). 기존처럼 숫자 입력칸(NumberInput) 값이어야 함
export function calcExportPlt(inputs){
  const rows = buildExportRows();
  const palletL = num(inputs.L) || 110;
  const palletW = num(inputs.W) || 110;
  const palletH = num(inputs.H) || 150;
  const baseHeightCm = num(inputs.baseHeight) || 0;
  ui.exportPltBaseHeightCm = baseHeightCm;
  const usableH = Math.max(0, palletH - baseHeightCm); // 밑판 두께 뺀 실제 적재 가능 높이
  const tareKg = num(inputs.tare) || 20;
  ui.exportPltTareKg = tareKg;
  const mixed = inputs.mixMode ? inputs.mixMode==='O' : (ui.pltMixMode==='O');
  ui.pltMixMode = mixed ? 'O' : 'X';
  const pns = Array.from(new Set(rows.map(r=>r.품번)));
  ui.exportPltByProduct = new Map();
  ui.exportPltDetail = new Map();
  ui.exportPltPacking = [];
  let fractionSum = 0;
  let hasAny = false;
  const mixedItems = [];
  pns.forEach(pn=>{
    const box = boxInfoFor(pn);
    if(!(box.아웃W && box.아웃D && box.아웃H)) return;
    const needed = ui.neededQty.get(pn);
    let qty = needed;
    if(!qty){
      qty = ui.exportList.filter(x=>x.품번===pn && x.창고 && x.창고!=='재고없음' && typeof x.가용재고==='number')
        .reduce((s,r)=>s+r.가용재고, 0);
    }
    if(!qty) return;
    const r = computePltForRow(pn, qty, palletL, palletW, usableH);
    if(r.status!=='ok' || !r.boxesPerPallet) return;
    hasAny = true;
    const weightPerBoxKg = box.아웃무게g>0 ? box.아웃무게g/1000 : 0;
    const totalWeightKg = r.boxesNeeded * weightPerBoxKg;
    let pltCountForThis;
    if(mixed){
      const frac = r.boxesNeeded / r.boxesPerPallet;
      fractionSum += frac;
      pltCountForThis = frac;
      ui.exportPltByProduct.set(pn, Math.round(frac*100)/100);
      mixedItems.push({pn, 품명:r.품명, frac, boxesPerPallet:r.boxesPerPallet, weightPerBoxKg, perLayer:r.perLayer, boxH:r.boxH});
    } else if(r.pltNeeded!==null){
      pltCountForThis = r.pltNeeded;
      ui.exportPltByProduct.set(pn, r.pltNeeded);
    }
    // PLT당 예상중량 = (박스 중량 / 이 품목이 쓰는 PLT 수) + 빈 PLT 자체무게
    // 혼적일 때는 이 품목이 파레트를 점유하는 비율(frac)만큼만 빈 PLT 무게를 나눠 가짐 (수학적으로 동일한 식)
    // 참고: 혼적일 때 이 값은 "이 품목 혼자 파레트를 채웠다면"의 환산값이며, 실제 물리적 PLT 하나의 무게/규격은
    // 아래 대표 품목 행에 표시되는 실제 파레트 값을 봐야 합니다 (여러 품목이 같이 실리므로).
    const weightPerPltKg = (pltCountForThis>0) ? (totalWeightKg/pltCountForThis) + tareKg : 0;
    // 실제 적재 박스수: 이 품목이 쓰는 PLT 수(올림)에 총 박스수를 고르게 나눈 값 — 이론상 최대치(boxesPerPallet)와 다름
    const effectivePltCount = Math.max(1, Math.ceil(pltCountForThis||1));
    const actualBoxesPerPallet = Math.ceil(r.boxesNeeded / effectivePltCount);
    // 실제 적재 높이: 실제로 실리는 박스수 기준으로 몇 단이 쌓이는지 계산 (박스높이 × 단수)
    const actualLayers = r.perLayer>0 ? Math.ceil(actualBoxesPerPallet / r.perLayer) : 0;
    const actualHeightCm = actualLayers * r.boxH;
    ui.exportPltDetail.set(pn, {boxesPerPallet:r.boxesPerPallet, boxesNeeded:r.boxesNeeded, actualBoxesPerPallet, totalWeightKg, weightPerPltKg, remainderUnits:r.remainderUnits, perBox:r.perBox, actualHeightCm, palletL, palletW});
  });
  if(mixed && mixedItems.length>0){
    ui.exportPltPacking = packPalletsMixed(mixedItems, tareKg, palletL, palletW);
    ui.exportPltMixedTotal = ui.exportPltPacking.length; // 실제 배정 결과를 최종 PLT 수로 사용
    // 표시용: 품번마다 소속된 PLT 번호 목록, 그리고 대표(그 파레트의 첫 품목)일 때만 실제중량/실제규격 부여(중복 방지)
    ui.exportPltNumbersByProduct = new Map();
    ui.exportPltRepWeightByProduct = new Map();
    ui.exportPltRepDimsByProduct = new Map();
    ui.exportPltPacking.forEach(p=>{
      if(p.items.length===0) return;
      const repPn = p.items[0].pn;
      p.items.forEach(it=>{
        if(!ui.exportPltNumbersByProduct.has(it.pn)) ui.exportPltNumbersByProduct.set(it.pn, []);
        ui.exportPltNumbersByProduct.get(it.pn).push(p.index);
      });
      if(!ui.exportPltRepWeightByProduct.has(repPn)) ui.exportPltRepWeightByProduct.set(repPn, []);
      ui.exportPltRepWeightByProduct.get(repPn).push(p.weightKg);
      if(!ui.exportPltRepDimsByProduct.has(repPn)) ui.exportPltRepDimsByProduct.set(repPn, []);
      ui.exportPltRepDimsByProduct.get(repPn).push(p.dims);
    });
  } else {
    ui.exportPltMixedTotal = (mixed && hasAny) ? Math.ceil(fractionSum) : null;
    ui.exportPltNumbersByProduct = new Map();
    ui.exportPltRepWeightByProduct = new Map();
    ui.exportPltRepDimsByProduct = new Map();
  }
}

// port: 다운로드 대신 {csv, filename} 반환
export function exportCsv(){
  const rows = buildExportRows();
  if(rows.length===0) return;
  const mixed = ui.pltMixMode==='O';
  const headers = ['품번','품명','ERP 바코드','바코드','창고','우선순위','가용재고','할당수량','필요수량','부족/여유','거래처(제조사)','입고예정 일자','입고예정 수량','LOT','유통기한','유통기한 가용재고','아웃박스 규격(mm)','아웃박스 무게(g)','아웃박스 입수','인박스 규격(mm)','인박스 무게(g)','인박스 입수','제품 규격(mm)','제품 무게(g)','예상 총 박스수','잔량(마지막 박스, 개)','예상 총 박스중량(kg)','PLT당 박스수','PLT 최대 적재 가능 박스수','PLT 번호','PLT 예상중량(kg)','PLT 예상 W×D×H(cm)'];
  const escape = v => {
    const s = (v===null||v===undefined)?'':String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(x=>{
    const incDate = incomingDateText(x.품번);
    const incQty = incomingQtyText(x.품번);
    const lot = x._expiry ? x._expiry.LOT : '';
    const expDate = x._expiry ? x._expiry.유통기한 : '';
    const expQty = x._expiry ? fmt(x._expiry.가용재고수량) : '';
    const mf = masterFieldsFor(x.품번);
    const isRealWh = !x.isSynthetic && x.창고 && x.창고!=='재고없음';
    const priority = isRealWh ? (x.우선순위||1) : '';
    const alloc = isRealWh ? fmt(x._allocated||0) : '';
    const needed = x._needed || '';
    const diff = (x._needed && x._diff!==undefined) ? (x._diff<0?x._diff:'+'+x._diff) : '';
    const detail = ui.exportPltDetail.get(x.품번);
    const boxesNeeded = detail ? fmt(detail.boxesNeeded) : '';
    const remainder = detail ? (detail.remainderUnits>0 ? fmt(detail.remainderUnits) : '0(딱맞음)') : '';
    const totalWeight = detail && detail.totalWeightKg ? fmt(detail.totalWeightKg) : '';
    const actualBoxesPerPallet = detail ? fmt(detail.actualBoxesPerPallet) : '';
    const maxBoxesPerPallet = (!mixed && detail) ? fmt(detail.boxesPerPallet) : '';
    let pltNumber = '', pltWeight = '', pltDims = '';
    if(mixed){
      const nums = ui.exportPltNumbersByProduct.get(x.품번);
      if(nums && nums.length>0) pltNumber = nums.map(n=>'PLT '+n).join(' / ');
      const weights = ui.exportPltRepWeightByProduct.get(x.품번);
      if(weights && weights.length>0) pltWeight = weights.map(w=>fmt(w)).join(' / ');
      const dimsArr = ui.exportPltRepDimsByProduct.get(x.품번);
      if(dimsArr && dimsArr.length>0) pltDims = dimsArr.map(d=>`${fmt(d.L)}x${fmt(d.W)}x${fmt(d.H)}`).join(' / ');
    } else if(ui.exportPltByProduct.has(x.품번)){
      pltNumber = fmt(ui.exportPltByProduct.get(x.품번)) + ' PLT';
      pltWeight = detail && detail.weightPerPltKg ? fmt(detail.weightPerPltKg) : '';
      pltDims = detail ? `${fmt(detail.palletL)}x${fmt(detail.palletW)}x${fmt(detail.actualHeightCm)}` : '';
    }
    lines.push([x.품번,x.품명,x.바코드,baseBarcode(x.바코드),x.창고,priority,x.가용재고,alloc,needed,diff,x.거래처,incDate,incQty,lot,expDate,expQty,mf.아웃규격,mf.아웃무게,mf.아웃입수,mf.인규격,mf.인무게,mf.인입수,mf.제품규격,mf.제품무게,boxesNeeded,remainder,totalWeight,actualBoxesPerPallet,maxBoxesPerPallet,pltNumber,pltWeight,pltDims].map(escape).join(','));
  });
  if(ui.exportPltByProduct.size>0){
    const pltTotal = mixed && ui.exportPltMixedTotal!==null
      ? ui.exportPltMixedTotal
      : Array.from(new Set(rows.map(r=>r.품번))).reduce((s,pn)=> s + (ui.exportPltByProduct.get(pn)||0), 0);
    const boxWeightTotal = Array.from(ui.exportPltDetail.values()).reduce((s,d)=>s+d.totalWeightKg,0);
    const tareKg = ui.exportPltTareKg || 20;
    const pltTareTotal = pltTotal * tareKg;
    const grandTotal = boxWeightTotal + pltTareTotal;
    const blankCols = headers.length - 4;
    lines.push(['합계'+(mixed?'(혼적 기준)':''), ...Array(blankCols).fill(''), fmt(pltTotal)+' PLT', fmt(grandTotal)+'kg ('+fmt(boxWeightTotal)+'kg 박스+'+fmt(pltTareTotal)+'kg PLT)', ''].map(escape).join(','));
  }
  if(mixed && ui.exportPltPacking && ui.exportPltPacking.length>0){
    lines.push('');
    lines.push('PLT 구성 상세 (혼적)');
    lines.push(['PLT 번호','포함 품목(비중)','사용률','예상 중량(kg)'].map(escape).join(','));
    ui.exportPltPacking.forEach(p=>{
      const itemsText = p.items.map(it=>`${it.pn} (${Math.round(it.frac*100)}%)`).join(' / ');
      lines.push([`PLT ${p.index}`, itemsText, Math.round(p.used*100)+'%', fmt(p.weightKg)].map(escape).join(','));
    });
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  const ts = new Date().toISOString().slice(0,10);
  return {csv, filename:`재고선택목록_${ts}.csv`};
}
