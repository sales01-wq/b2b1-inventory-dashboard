// 비교 테스트 공용 도구: 운영 index.html 을 jsdom 에서 실행(정답)하고, src/lib 모듈을 같은 기준일로 불러옵니다.
import fs from 'node:fs';
import path from 'node:path';
import {JSDOM, VirtualConsole} from 'jsdom';
import {vi} from 'vitest';
import Papa from 'papaparse';

export const NOW = new Date(2026, 10, 11, 9, 30).getTime(); // 2026-11-11 09:30 (로컬 시간)
const INDEX_HTML = fs.readFileSync(path.resolve(__dirname, '../../../../index.html'), 'utf8');

/** 운영 index.html 을 실행하고 계산 함수 · 전역 객체를 꺼냅니다. */
export function loadOracle() {
  const vc = new VirtualConsole(); // 다운로드 클릭 시의 "navigation not implemented" 같은 jsdom 경고는 무시
  const csv = {};
  const dom = new JSDOM(INDEX_HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse(w) {
      // 페이지 안의 시계를 기준일로 고정
      w.eval(`(function(){ const R = Date, T = ${NOW};
        Date = class extends R { constructor(...a){ a.length ? super(...a) : super(T); } static now(){ return T; } };
      })()`);
      // CSV 다운로드를 가로채서 내용과 파일명만 기록
      w.Blob = class { constructor(parts) { this.text = parts.join(''); } };
      w.URL.createObjectURL = b => { csv.last = {csv: b.text}; return 'blob:x'; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { if (csv.last) csv.last.filename = this.download; };
      w.Papa = Papa; // 운영 페이지는 CDN 으로 불러오는 라이브러리
    },
  });
  const w = dom.window;
  const api = new Proxy({}, {get: (_, k) => (['state', 'ui', 'settings', 'unresolvedFiles'].includes(k) ? w.eval(k) : w[k])});
  // 기존 화면은 PLT 입력칸 값을 직접 읽으므로 같은 값을 입력칸에 넣어줍니다.
  const setPltInputs = inputs => {
    const put = (id, v) => {
      let el = w.document.getElementById(id);
      if (!el) { el = w.document.createElement('input'); el.id = id; w.document.body.appendChild(el); }
      el.value = v;
    };
    put('exportPltL', inputs.L); put('exportPltW', inputs.W); put('exportPltH', inputs.H);
    put('exportPltBaseHeight', inputs.baseHeight); put('exportPltTare', inputs.tare);
    w.document.querySelectorAll('input[name="pltMixMode"]').forEach(r => r.remove());
    const r = w.document.createElement('input');
    r.type = 'radio'; r.name = 'pltMixMode'; r.value = inputs.mixMode; r.checked = true;
    w.document.body.appendChild(r);
  };
  return {
    api, w,
    calcExportPlt: inputs => { setPltInputs(inputs); w.calcExportPlt(); },
    csv: name => { csv.last = undefined; w[name](); return csv.last; },
    close: () => w.close(),
  };
}

/** src/lib 로 옮긴 모듈 (매번 새로 불러와 전역 상태를 초기화) */
export async function loadPort() {
  vi.resetModules();
  const mods = await Promise.all([
    import('../store.js'), import('../parse.js'), import('../forecast.js'), import('../sales.js'), import('../lookup.js'), import('../views.js'), import('../upload.js'),
  ]);
  const api = Object.assign({}, ...mods);
  const CSV = {downloadForecastListCsv: 'forecastListCsv', downloadForecastCsv: 'forecastCsv', downloadSkuStatusCsv: 'skuStatusCsv', downloadExportCsv: 'exportCsv'};
  return {api, calcExportPlt: inputs => api.calcExportPlt(inputs), csv: name => api[CSV[name]](), close() {}};
}

const isForecastItem = v => !!v && typeof v === 'object' && '품번' in v && 'orderQty' in v && 'grade' in v;
/** 서로 다른 실행 환경(jsdom / node)의 Map · Set · Date 를 비교 가능한 모양으로 바꿈 */
export function canon(v) {
  const t = Object.prototype.toString.call(v);
  if (t === '[object Map]') return {map: [...v].map(([k, x]) => [canon(k), canon(x)])};
  if (t === '[object Set]') return {set: [...v].map(canon)};
  if (t === '[object Date]') return 'D:' + (isNaN(v.getTime()) ? 'invalid' : v.getTime());
  if (t === '[object RegExp]') return String(v);
  if (typeof v === 'function') return 'fn';
  if (Array.isArray(v) && v.length && v.every(isForecastItem)) return v.map(canon).sort((a, b) => (a.품번 < b.품번 ? -1 : 1)); // 정렬 순서도 새 방식이라 품번순으로 맞춰 비교
  if (Array.isArray(v)) {
    const extra = Object.keys(v).filter(k => !/^\d+$/.test(k));
    const arr = v.map(canon);
    return extra.length ? {arr, extra: Object.fromEntries(extra.map(k => [k, canon(v[k])]))} : arr;
  }
  // 발주 현황 계산(부족 수량 · 위험 판정)은 새 방식이라 운영 index.html 과 다름 → 품목 항목은 바뀌지 않은 값(재고 · 판매 합계 · 입고일정 · 히어로 설정)만 비교.
  // 새 계산은 forecast.target.test.js 가 따로 검증
  if (isForecastItem(v)) {
    return Object.fromEntries(['품번', '품명', '바코드', 'brand', 'available', 'sold6', 'hero', 'heroMin', 'heroWarn', 'sched'].map(k => [k, canon(v[k])]));
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).map(k => [k, canon(v[k])]));
  return v;
}

