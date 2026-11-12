// 수집할 ERP 파일 5개. 파일 이름은 기존 Apps Script 의 cleanBaseName() 이 날짜 · (1) 을 떼고 탭 이름으로 쓰므로,
// 아래 이름을 바꾸면 대시보드가 보는 탭 이름이 바뀝니다. 기존에 올리던 이름과 다르면 config.json 의 "files" 로 덮어쓰세요.
// type 은 대시보드(web/src/lib/parse.js)의 시트 종류, team 은 판매실적의 팀.
export const FILES = [
  {id: 'inventory', file: '가용재고조회_olive_{date}.xlsx', type: 'inventory'},
  {id: 'schedule', file: '제품일정표_{date}.xlsx', type: 'schedule'},
  {id: 'sales1', file: '일자별판매실적분석_{date}_B2B1팀.xlsx', type: 'sales', team: 'B2B1팀'},
  {id: 'sales2', file: '일자별판매실적분석_{date}_B2B2팀.xlsx', type: 'sales', team: 'B2B2팀'},
  {id: 'expiry', file: '유통기한_{date}.xlsx', type: 'expiry'},
];
// 상품마스터는 수집하지 않음 (기존 방식 그대로). 이 이름의 파일은 묶음에 절대 넣지 않음.
export const NEVER = ['상품마스터'];

export const ymd = (d = new Date()) => {
  const k = new Date(d.getTime() + 9 * 3600e3); // 한국 시간
  return k.toISOString().slice(0, 10).replace(/-/g, '');
};
export const fileName = (def, d) => def.file.replace('{date}', ymd(d));
