import {openDetail} from '../lib/insights.js';

/** 품번 — 누르면 어느 화면에서든 같은 상품 상세 패널이 열림 */
export function ProductLink({pn, className}: {pn: string; className?: string}) {
  return <button type="button" className={'pn-link ' + (className || '')} onClick={e => { e.stopPropagation(); openDetail(pn); }} aria-label={`${pn} 상세 보기`}><code>{pn}</code></button>;
}
