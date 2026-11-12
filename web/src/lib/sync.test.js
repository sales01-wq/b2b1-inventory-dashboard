// 공유 저장본 검사 · 동기화 안내 (새 기능). 운영 화면에는 없어서 운영과 비교하는 대신 기대값을 직접 확인
import {describe, expect, it} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {snapshotProblem, syncNotice} from './views.js';

const sh = makeSheets(new Date(2026, 10, 11, 9, 30).getTime());
const ok = {가용재고조회_olive: sh.inventory, 일자별판매실적분석_B2B1팀: sh.sales1, 제품일정표_olive: sh.schedule};

describe('snapshotProblem', () => {
  it('정상 저장본은 문제 없음 (상품마스터 · 유통기한은 선택)', () => { expect(snapshotProblem(ok)).toBe(''); expect(snapshotProblem({...ok, 상품마스터: sh.productMaster})).toBe(''); });
  it('가용재고가 빈 내용(머리글만) · 판매실적이 엉뚱한 내용 · 비어 있으면 문제', () => {
    expect(snapshotProblem({...ok, 가용재고조회_olive: sh.inventory.slice(0, 2)})).toMatch(/가용재고조회/);
    expect(snapshotProblem({...ok, 일자별판매실적분석_B2B1팀: [['아무', '내용']]})).toMatch(/일자별판매실적분석/);
    expect(snapshotProblem({})).toMatch(/가용재고조회, 일자별판매실적분석/);
    expect(snapshotProblem(null)).toMatch(/필수 시트/);
  });
});

describe('syncNotice', () => {
  const now = new Date('2026-11-12T12:00:00Z').getTime(), at = h => ({at: now - h * 3600000, by: '수집기'});
  it('정상 · 최근 데이터는 안내 없음', () => { expect(syncNotice({lastUpdate: at(2)}, now)).toEqual({problem: null, stale: null}); expect(syncNotice({}, now)).toEqual({problem: null, stale: null}); });
  it('36시간 이상이면 오래됨 (48시간부터는 일 단위)', () => {
    expect(syncNotice({lastUpdate: at(35)}, now).stale).toBeNull();
    expect(syncNotice({lastUpdate: at(40)}, now).stale).toMatch(/40시간 전/);
    expect(syncNotice({lastUpdate: at(72)}, now).stale).toMatch(/3일 전/);
  });
  it('저장본 · 묶음 문제는 이유와 함께, 이전 데이터 유지 중임을 알림', () => {
    expect(syncNotice({problem: {snapshot: {msg: '행 수가 급감함: sales 100 → 3'}, bundle: null}}, now).problem).toMatch(/행 수가 급감함.*이전 정상 데이터/);
    expect(syncNotice({problem: {snapshot: null, bundle: {file: 'FAILED_ERP_BUNDLE_a.zip', msg: '시트 종류가 맞지 않음'}}}, now).problem).toMatch(/FAILED_ERP_BUNDLE_a\.zip: 시트 종류가 맞지 않음/);
  });
});

import {beforeEach} from 'vitest';
import {state} from './store.js';
import {uploadChecks} from './views.js';

describe('uploadChecks (수동 업로드 적용 전 검사)', () => {
  const f = (fileName, rows, key) => ({fileName, rows, key});
  beforeEach(() => { state.inventory = []; state.schedule = []; state.expiry = []; state.productMaster = []; state.salesByTeam = {}; });
  it('정상 파일은 통과', () => { expect(uploadChecks([f('가용재고조회.xlsx', sh.inventory, 'inventory'), f('판매_B2B1팀.xlsx', sh.sales1, 'sales')])).toEqual({errors: [], warnings: []}); });
  it('머리글만 있거나 종류를 잘못 고르면 적용 불가', () => {
    expect(uploadChecks([f('a.xlsx', sh.inventory.slice(0, 2), 'inventory')]).errors[0]).toMatch(/데이터 행이 없습니다/);
    expect(uploadChecks([f('b.xlsx', sh.inventory, 'sales')]).errors[0]).toMatch(/일자별판매실적분석.*머리글을 찾을 수 없습니다/);
    expect(uploadChecks([{fileName: 'c.xlsx', rows: null, key: null, error: true}, f('d.xlsx', [['x']], null)])).toEqual({errors: [], warnings: []}); // 읽기 실패 · 미인식은 기존 화면이 안내
  });
  it('파일 이름의 팀과 내용(부서)의 팀이 다르면 적용 불가', () => {
    expect(uploadChecks([f('일자별판매실적분석_20261013_B2B2팀.xlsx', sh.sales1, 'sales')]).errors[0]).toMatch(/B2B2팀 인데 내용\(부서\)은 B2B1팀/);
  });
  it('현재 데이터보다 행이 절반 아래로 줄면 경고 (현재 20행 이상일 때만)', () => {
    state.inventory = Array.from({length: 40}, (_, i) => ({품번: 'P' + i}));
    expect(uploadChecks([f('inv.xlsx', sh.inventory, 'inventory')]).warnings[0]).toMatch(/현재 40 → 15 로 크게 줄었습니다/);
    state.inventory = Array.from({length: 10}, (_, i) => ({품번: 'P' + i}));
    expect(uploadChecks([f('inv.xlsx', sh.inventory, 'inventory')]).warnings).toEqual([]);
  });
});
