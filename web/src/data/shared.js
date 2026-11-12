// index.html 에서 그대로 옮긴 구글 로그인 · 공유 데이터(Vercel API) 처리입니다. API 호출 방식은 바꾸지 않았습니다.
// 바꾼 곳("port:")은 화면을 직접 고치던 부분뿐이며, 이제 shared 의 값을 바꾸고 emit() 으로 화면에 알립니다.
import {READ_ONLY} from '../app/defaults';
import {state, emit} from '../lib/store.js';
import {fmt} from '../lib/format';
import {detectSheetType} from '../lib/parse.js';
import {unresolvedFiles, applyUploadedData} from '../lib/upload.js';
import {loadRemoteSettings} from './settings.js';
import {uploadDoneText, snapshotProblem} from '../lib/views.js';

/** @type {Record<string, any>} 기존 전역 객체 — 화면(TS)에서 자유롭게 읽도록 */
export const shared = {active:false, token:null, user:null, clientId:'', domain:'', meta:null, loading:false, updating:false};
// port: 예전에는 화면 요소에 직접 쓰던 값들. gated 의 처음 값은 기존 index.html 10행과 같은 규칙 (localhost 가 아니면 로그인 화면)
Object.assign(shared, {
  gated: (function(){ try{ var h=location.hostname; return /^https?:$/.test(location.protocol)&&h!=='localhost'&&h!=='127.0.0.1'; }catch(e){ return false; } })(),
  gate: null, bar: null, infoText: '', gsStatus: null, gsLoading: false, syncText: '', gsUrl: '',
});

export const TOKEN_KEY = 'inv_idtoken';

export function jwtExp(t){ try{ return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000; }catch(_e){ return 0; } }

export function storeToken(t){ try{ if(t) localStorage.setItem(TOKEN_KEY,t); else localStorage.removeItem(TOKEN_KEY); }catch(_e){} }

export function loadStoredToken(){ try{ const t = localStorage.getItem(TOKEN_KEY); return (t && jwtExp(t) > Date.now()+60000) ? t : null; }catch(_e){ return null; } }

export function setGate(msg, isErr){
  shared.gate = {msg, isErr:!!isErr}; emit(); // port
}

export function showGate(msg, isErr){
  shared.gated = true; // port
  setGate(msg, isErr);
}

// port: HTML 문자열 대신 글자(text)와 부가 정보(extra: progress · detail · action)로 받음 — 서버에서 온 파일명 · 이메일이 HTML 로 해석되지 않게
export function setSharedBar(kind, text, extra){
  shared.bar = text ? {kind, text, ...extra} : null; emit();
}

export async function sApi(path, opts){
  const r = await fetch(path, {headers:{Authorization:'Bearer '+shared.token}});
  if(r.status===401){
    storeToken(null); shared.token = null;
    showGate('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true);
    tryPrompt();
    throw new Error('로그인이 만료되었습니다.');
  }
  let j = null; try{ j = await r.json(); }catch(_e){}
  if(!r.ok) throw new Error((j && j.error) || ('서버 오류 ('+r.status+')'));
  return j;
}

export function tryPrompt(){ try{ google.accounts.id.prompt(); }catch(_e){} }

export function waitForGsi(){
  return new Promise(res=>{ let n=0; (function t(){ if(window.google && google.accounts && google.accounts.id) return res(true); if(++n>100) return res(false); setTimeout(t,100); })(); });
}

export async function onGoogleCredential(resp){
  const token = resp && resp.credential;
  if(!token) return;
  shared.token = token;
  shared.settingsPromise = loadRemoteSettings();   // 공유 설정(히어로 기준·등급 기준·입력한 박스 정보)도 동시에 받기
  setGate('확인 중입니다...');
  const firstLoad = (!shared.user && !state.loaded) ? loadSharedData() : null; // 로그인 확인과 동시에 데이터 받기 시작
  try{
    const r = await fetch('/api/me', {headers:{Authorization:'Bearer '+token}});
    const j = await r.json().catch(()=>({}));
    if(r.status===403){
      shared.token = null; storeToken(null);
      showGate(`${j.email||'이 계정'}은(는) 접근 권한이 없습니다. 회사 계정(@${shared.domain})으로 로그인해 주세요.`, true);
      try{ google.accounts.id.disableAutoSelect(); }catch(_e){}
      return;
    }
    if(!r.ok) throw new Error(j.error || r.status);
    storeToken(token);
    const firstTime = !shared.user;
    shared.user = j;
    shared.gated = false; emit(); // port: 사용자 표시는 화면이 shared.user 로 그림
    if(!firstLoad && (firstTime || !state.loaded)) loadSharedData();
  }catch(e){
    shared.token = null;
    showGate('로그인 확인 중 오류가 발생했습니다: ' + e.message, true);
  }
}

export function onAuthExpired(){
  storeToken(null); shared.token = null;
  showGate('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true);
  tryPrompt();
}

export function idbOpen(){ return new Promise((res,rej)=>{ const r = indexedDB.open('inv_cache',1); r.onupgradeneeded = ()=>r.result.createObjectStore('snap'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); }); }

export async function idbGet(k){ try{ const db = await idbOpen(); return await new Promise(res=>{ const q = db.transaction('snap').objectStore('snap').get(k); q.onsuccess = ()=>res(q.result||null); q.onerror = ()=>res(null); }); }catch(_e){ return null; } }

export async function idbSet(k,v){ try{ const db = await idbOpen(); await new Promise(res=>{ const t = db.transaction('snap','readwrite'); if(v===null) t.objectStore('snap').delete(k); else t.objectStore('snap').put(v,k); t.oncomplete = ()=>res(); t.onerror = ()=>res(); }); }catch(_e){} }

export function verOf(meta){ return (meta && meta.snapshot && meta.snapshot.at) || (meta && meta.lastUpdate && meta.lastUpdate.at) || 0; }

export function parseBundleMeta(r){ try{ return JSON.parse(decodeURIComponent(r.headers.get('X-Meta')||'')); }catch(_e){ return {}; } }

export async function fetchBundle(have, fresh){
  const r = await fetch('/api/snapshot?have='+encodeURIComponent(have||'')+(fresh?'&fresh=1':''), {headers:{Authorization:'Bearer '+shared.token}});
  if(r.status===401){ onAuthExpired(); throw new Error('로그인이 만료되었습니다.'); }
  if(r.status===204) return {unchanged:true, meta:parseBundleMeta(r)};
  if(r.status===409) return {none:true};
  if(!r.ok) throw new Error('저장본 다운로드 실패 ('+r.status+')');
  if(typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 저장본 압축 해제를 지원하지 않습니다.');
  const meta = parseBundleMeta(r);
  const data = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  return {data, meta};
}

export function applySharedData(data, meta, t0){
  shared.meta = meta || {};
  shared.pending = null;
  unresolvedFiles.length = 0;
  Object.keys(data).forEach(name=>{
    const rows = data[name];
    unresolvedFiles.push({fileName:`구글시트 — ${name}`, rows, key:detectSheetType(rows)});
  });
  const t1 = performance.now();
  const applied = applyUploadedData('googlesheet');
  { // port: #sharedInfoText 대신 shared.infoText
    const lu = shared.meta.lastUpdate;
    shared.infoText = (lu ? `마지막 업데이트: ${new Date(lu.at).toLocaleString('ko-KR')} · ${lu.by}` : '아직 업데이트 기록이 없습니다.')
      + (t0 ? ` · 화면 준비 ${((performance.now()-t0)/1000).toFixed(1)}초 (계산 ${((performance.now()-t1)/1000).toFixed(1)}초)` : '');
  }
  emit({applied, mode:'googlesheet'});
}

export async function loadSharedData(opts){
  opts = opts || {};
  if(shared.loading) return;
  shared.loading = true;
  const t0 = performance.now();
  try{
    const cached = opts.noCache ? null : await idbGet('snapshot');
    const haveCache = !!(cached && cached.data && cached.meta && cached.meta.snapshot);
    if(haveCache){
      applySharedData(cached.data, cached.meta, t0);   // 남아있던 사본을 먼저 바로 보여줌
      setSharedBar('', '');
    } else {
      setSharedBar('info','최신 공유 데이터를 받는 중입니다...');
    }
    let res = null, snapErr = '';
    try{
      res = await fetchBundle(haveCache ? cached.meta.snapshot.at : '', opts.fresh);
    }catch(e){ if(/만료/.test(e.message)) throw e; snapErr = e.message; console.warn('저장본 받기 실패', e); }

    if(res && res.unchanged){ shared.meta = res.meta || shared.meta; return; }
    if(res && res.data){
      // port: 새 저장본에 필수 시트 내용이 없으면 캐시 · 화면에 반영하지 않고 이전 데이터를 유지 (잘못된 업로드가 정상 데이터를 덮지 못하게)
      const bad = snapshotProblem(res.data);
      if(bad){ shared.meta = res.meta || shared.meta; setSharedBar('err', `새 저장본이 올바르지 않아 이전 데이터를 유지합니다: ${bad}`); return; }
      idbSet('snapshot', {data:res.data, meta:res.meta});
      if(haveCache){
        shared.pending = res;
        setSharedBar('info', '🔔 새 데이터가 있습니다', {action:{label:'지금 적용', run:()=>{
          if(shared.pending){ applySharedData(shared.pending.data, shared.pending.meta); setSharedBar('', ''); }
        }}});
      } else {
        if(shared.settingsPromise) await shared.settingsPromise;
        applySharedData(res.data, res.meta, t0);
        setSharedBar('', '');
      }
      return;
    }
    if(haveCache){
      if(snapErr) setSharedBar('info', `저장된 데이터를 보여드리는 중입니다 (최신 확인 실패: ${snapErr})`);
      return;
    }
    if(res && res.none){ snapErr = '서버에 저장본이 아직 없음'; if(!READ_ONLY) sApi('/api/data?action=ensure').catch(()=>{}); }

    // 저장본이 없거나 받지 못했을 때: 시트를 나눠서 직접 읽는 방식으로 대신 불러옴
    const meta = await sApi('/api/data?action=meta');
    const data = {};
    const CH = 1000, jobs = [], store = {};
    (meta.sheets||[]).forEach(sh=>{
      if(!sh.rows) return;
      const n = Math.ceil(sh.rows/CH);
      store[sh.name] = new Array(n);
      for(let i=0;i<n;i++) jobs.push({name:sh.name, from:i*CH, idx:i});
    });
    if(jobs.length===0) throw new Error('공유 시트에 데이터가 없습니다. 업로드 폴더에 엑셀을 올려 업데이트해 주세요.');
    let done = 0, ptr = 0;
    async function worker(){
      while(ptr < jobs.length){
        const j = jobs[ptr++];
        const url = `/api/data?action=rows&sheet=${encodeURIComponent(j.name)}&from=${j.from}&count=${CH}`;
        let r;
        try{ r = await sApi(url); }catch(e){ if(/만료/.test(e.message)) throw e; r = await sApi(url); }
        store[j.name][j.idx] = r.rows || [];
        done++;
        setSharedBar('info', `공유 데이터 불러오는 중... ${done}/${jobs.length}`, snapErr ? {detail:`저장본 사용 불가 사유: ${snapErr}`} : undefined);
      }
    }
    await Promise.all([worker(),worker(),worker(),worker()]);
    Object.keys(store).forEach(name=>{
      const rows = [];
      store[name].forEach(chunk=>{ for(let i=0;i<chunk.length;i++) rows.push(chunk[i]); });
      data[name] = rows;
    });
    if(shared.settingsPromise) await shared.settingsPromise;
    applySharedData(data, meta, t0);
    setSharedBar('', '');
  }catch(e){
    if(!/만료/.test(e.message)) setSharedBar('err', '데이터를 불러오지 못했습니다: ' + e.message);
  }finally{
    shared.loading = false;
  }
}

export async function sharedRefresh(){
  const u = shared.user; if(!u || shared.updating) return;
  if(!u.isUpdater || READ_ONLY){ return loadSharedData({noCache:true, fresh:true}); }
  shared.updating = true;
  emit(); // port: 버튼 상태(업데이트 중...)는 화면이 shared.updating 으로 그림
  try{
    setSharedBar('info','업로드 폴더의 새 파일을 확인하고 있습니다...');
    await sApi('/api/data?action=update');
    let guard = 0;
    while(guard++ < 400){
      await new Promise(r=>setTimeout(r,1500));
      const p = await sApi('/api/data?action=progress');
      if(p.status==='processing' && p.totalCount>0){
        const pct = Math.round(p.doneCount/p.totalCount*100);
        setSharedBar('info', `파일 처리 중: ${p.currentFile||'...'} (${p.doneCount}/${p.totalCount}, ${pct}%)`, {progress:pct});
      } else if(p.status==='done' || p.status==='idle'){ break; }
      else if(p.status==='error'){ throw new Error('서버에서 파일 처리 중 오류가 발생했습니다. Apps Script 실행 로그를 확인해 주세요.'); }
    }
    shared.loading = false;
    await loadSharedData({noCache:true, fresh:true});
  }catch(e){
    if(!/만료/.test(e.message)) setSharedBar('err', '업데이트 실패: ' + e.message);
  }finally{
    shared.updating = false;
    emit();
  }
}

export async function checkForNewSharedData(){
  if(!shared.active || !shared.token || shared.loading || shared.updating || document.hidden) return;
  try{
    const meta = await sApi('/api/data?action=meta');
    const a = verOf(meta), b = verOf(shared.meta);
    if(a && a !== b){
      const lu = meta.lastUpdate || {at:a, by:''};
      setSharedBar('info', `🔔 새 데이터가 있습니다 (${new Date(lu.at).toLocaleString('ko-KR')} · ${lu.by})`, {action:{label:'지금 불러오기', run:()=>loadSharedData({noCache:true, fresh:true})}});
    }
  }catch(_e){}
}

export async function initSharedMode(){
  if(!shared.gated) return; // 로컬 파일로 열었을 때는 기존 방식
  let cfg = null;
  try{
    const r = await fetch('/api/config', {cache:'no-store'});
    if(r.ok) cfg = await r.json();
  }catch(_e){}
  if(!cfg || !cfg.clientId){
    shared.gated = false; emit(); // 서버 설정이 없으면 기존 업로드 방식으로 동작
    return;
  }
  shared.active = true; shared.clientId = cfg.clientId; shared.domain = cfg.domain || '';
  emit(); // port: 로그아웃 버튼은 화면이 logout() 을 부름
  const ok = await waitForGsi();
  if(!ok){ showGate('구글 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.', true); return; }
  google.accounts.id.initialize({client_id:shared.clientId, callback:onGoogleCredential, auto_select:true, hd:shared.domain||undefined, cancel_on_tap_outside:false});
  google.accounts.id.renderButton(document.getElementById('gsiBtn'), {theme:'outline', size:'large', text:'signin_with', shape:'pill', locale:'ko', width:260});
  const stored = loadStoredToken();
  if(stored){ setGate('로그인 정보를 확인하는 중입니다...'); onGoogleCredential({credential:stored}); }
  else { setGate(`회사 구글 계정${shared.domain?` (@${shared.domain})`:''}으로 로그인해 주세요.`); tryPrompt(); }
  setInterval(checkForNewSharedData, 120000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkForNewSharedData(); });
}

// port: #googleSheetStatus · #syncText 대신 shared.gsStatus · shared.syncText
export function renderGoogleSheetProgress(p){
  if(p && p.status==='processing' && p.totalCount>0){
    const pct = Math.max(0, Math.min(100, Math.round((p.doneCount/p.totalCount)*100)));
    shared.gsStatus = {kind:'info', text:`파일 처리 중: ${p.currentFile||'...'} (${fmt(p.doneCount)}/${fmt(p.totalCount)}, ${pct}%)`, progress:pct};
    shared.syncText = `처리 중 ${fmt(p.doneCount)}/${fmt(p.totalCount)} (${pct}%) — ${p.currentFile||''}`;
  } else if(p && p.status==='idle'){
    shared.gsStatus = {kind:'info', text:'새로 처리할 파일이 없습니다. 최신 데이터를 불러오는 중...'};
    shared.syncText = '최신 데이터 불러오는 중...';
  } else {
    shared.gsStatus = {kind:'info', text:'구글시트에서 최신 데이터를 가져오는 중입니다...'};
    shared.syncText = '구글시트 연결 중...';
  }
  emit();
}

// port: Apps Script 웹앱 URL 입력칸 값을 인자로 받음. 버튼 상태는 shared.gsLoading
export async function refreshFromGoogleSheet(webAppUrlInput){
  if(shared.active){ return sharedRefresh(); }
  const webAppUrl = (webAppUrlInput||'').trim();
  if(READ_ONLY){
    shared.gsStatus = {kind:'info', text:'읽기 전용 미리보기에서는 Apps Script 웹앱을 호출하지 않습니다 (운영 파일 처리 방지). CSV / 엑셀 업로드를 사용해 주세요.'}; emit();
    return;
  }
  if(!webAppUrl){
    shared.gsStatus = {kind:'info', text:'Apps Script 웹앱 URL을 먼저 입력해주세요.'}; emit();
    return;
  }
  shared.gsLoading = true;
  renderGoogleSheetProgress(null);

  let polling = true;
  const sep = webAppUrl.includes('?') ? '&' : '?';
  (async function pollProgress(){
    while(polling){
      try{
        const pr = await fetch(webAppUrl + sep + 'action=progress');
        if(pr.ok){
          const pj = await pr.json();
          if(polling) renderGoogleSheetProgress(pj);
        }
      }catch(_e){ /* 폴링 실패는 무시하고 계속 시도 */ }
      if(!polling) break;
      await new Promise(r=>setTimeout(r, 1200));
    }
  })();

  try{
    const res = await fetch(webAppUrl);
    polling = false;
    if(!res.ok){
      throw new Error(`웹앱 호출에 실패했습니다 (상태 ${res.status}). 배포 시 액세스 권한이 "모든 사용자"로 되어있는지, URL이 정확한지 확인해주세요.`);
    }
    const json = await res.json();
    const sheetNames = Object.keys(json);
    if(sheetNames.length===0){
      throw new Error('웹앱 응답에서 시트를 찾지 못했습니다.');
    }
    unresolvedFiles.length = 0;
    sheetNames.forEach(sheetName=>{
      const rows = json[sheetName];
      const detected = detectSheetType(rows);
      unresolvedFiles.push({fileName:`구글시트 — ${sheetName}`, rows, key:detected});
    });
    // port: 성공 문구는 기존처럼 이 패널(gsStatus)에 남기고, 실패하면 진행 문구가 그대로 남음 (기존 동작)
    const applied = applyUploadedData('googlesheet');
    if(!applied.error) shared.gsStatus = {kind:'info', text:uploadDoneText(applied)};
    shared.syncText = '';
    emit({applied, mode:'googlesheet'});
  }catch(e){
    polling = false;
    shared.gsStatus = {kind:'err', text:`새로고침 실패: ${(e&&e.message)||String(e)}`};
  }finally{
    polling = false;
    shared.gsLoading = false; emit();
  }
}

// port: 기존 로그아웃 버튼(logoutBtn) 클릭 처리
export async function logout(){
  storeToken(null);
  await idbSet('snapshot', null);
  try{ google.accounts.id.disableAutoSelect(); }catch(_e){}
  location.reload();
}
