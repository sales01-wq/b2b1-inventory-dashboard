// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
// 기존 전역 상태 객체 (state = 데이터·계산 결과, ui = 필터·선택·출고목록, settings = 공유 설정)
export const state = {
  salesByTeam: {}, // {'B2B1팀': [...], 'B2B2팀': [...]} 팀별 판매실적
  loaded: false,
  inventory: [], schedule: [], sales: [], expiry: [], productMaster: [],
  scheduleMonthLabels: ['8월','9월','10월'], // 실제 업로드된 제품일정표의 월로 자동 갱신됨
  expiryByProduct: new Map(),
  masterByProduct: new Map(),
  invByProduct: new Map(), schByProduct: new Map(),
  salesByProduct: new Map(), custQuarterProduct: new Map(),
  forecast: [], customers: [], quarters: [],
  lastSync: null, loading: false, error: null, fetchMode: null,
};

export const ui = {
  team: (function(){ try{ const t = localStorage.getItem('inv_team'); if(['전체','B2B1팀','B2B2팀'].includes(t)) return t; }catch(_e){} return 'B2B1팀'; })(), // 팀 필터
  forecastPage: 50, customerPage: 50,
  forecastExpanded: new Set(),
  forecastSelected: new Set(),
  forecastVisiblePns: [],
  forecastPnChips: new Set(),
  forecastCustomer: '',
  forecastOverstockScope: 'all', // 'all' | 'b2b1' | 'emp'
  skuStatusSearch: '',
  skuStatusSelected: new Set(), // 품번들 (여러 개 선택 가능)
  skuStatusLastMatches: [], // 최근 검색 결과 품번 목록 (전체추가 버튼용)
  forecastShowNoSales: false,
  brandSelected: new Set(), // 비어있으면 전체 — 바코드 조회 제외 전역 적용
  forecastGrade: '조치필요', forecastBrand: '', forecastSearch: '', rulesOpen: false,
  custId: '', custSelected: new Set(), pnSelected: new Set(),
  custMselSearch: '', pnMselSearch: '', customerPnSearch: '',
  lookupItems: [], // {barcode, status:'resolved'|'ambiguous'|'notfound', row, candidates}
  activeBatchIdx: null,
  collapsedItems: new Set(), // batchIdx들 — 선택완료로 접힌 항목
  masterInfoExpanded: new Set(), // 품번들 — 아웃박스·인박스·중량 정보 펼친 상태
  autoSelectIncludeAlternatives: false, // 추천 선택 시 동일 바코드 다른 품번(대체품목)도 포함할지
  showPltPackingDetail: false, // 혼적모드 PLT 구성 상세보기 토글
  neededQty: new Map(), // 품번 -> 필요 수량
  exportPltByProduct: new Map(), // 품번 -> 예상 PLT (다운로드 목록의 PLT계산 버튼으로 채워짐)
  exportPltDetail: new Map(), // 품번 -> {boxesPerPallet, totalWeightKg, weightPerPltKg}
  exportPltTareKg: 20, // 빈 PLT 자체 무게(kg)
  exportPltBaseHeightCm: 15, // 파레트 밑판 두께(cm) — 최대높이에서 빼고 적재층수 계산
  exportPltPacking: [], // 혼적모드 PLT별 배정 결과 [{index, items:[{pn,품명,frac}], used}]
  exportPltNumbersByProduct: new Map(), // 혼적모드: 품번 -> 소속된 PLT 번호 배열
  exportPltRepWeightByProduct: new Map(), // 혼적모드: 품번 -> 대표로 표시할 PLT 실제중량 배열 (중복 계산 방지)
  exportPltRepDimsByProduct: new Map(), // 혼적모드: 품번 -> 대표로 표시할 PLT 실제규격 배열
  manualBoxInfo: new Map(), // 품번 -> {아웃W,아웃D,아웃H,아웃무게g,아웃입수} (상품마스터에 없을 때 직접 입력)
  exportColWidths: {}, // 다운로드 목록 표: 사용자가 드래그로 조정한 컬럼 너비(px), 키는 컬럼 식별자
  pltMixMode: 'X', // 'O'(혼적) | 'X'(품목별 개별)
  exportPltMixedTotal: null,
  exportList: [], // {key, 품번, 품명, 바코드, 창고, 가용재고, 거래처}
  incomingList: [], // {key, 품번, 품명, 바코드, 거래처, 월, 날짜, 수량}
  expiryList: [], // {key, 품번, 품명, 바코드, 거래처, LOT, 유통기한, 가용재고수량}
};

export const settings = {rules:{}, hero:{}, box:{}};

// port: React 화면 연결 — 계산 함수나 데이터 처리가 상태를 바꾼 뒤 emit() 하면 화면이 다시 그려집니다.
const listeners = new Set();
let version = 0;
export function subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
export function getVersion(){ return version; }
export function emit(event){ version++; listeners.forEach(fn=>fn(event)); }
