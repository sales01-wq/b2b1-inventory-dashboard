import {useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {XMarkIcon} from '@heroicons/react/16/solid';
import {ui, emit} from '../lib/store.js';
import {exportColWidth, exportPanelModel} from '../lib/views.js';
import {setBoxDim} from '../data/settings.js';
import * as act from '../lib/actions.js';
import {fmt} from '../lib/format';

export const EXPORT_ANCHOR = 'lookup-export';

type Fixed = {fixed: string};
export type Editable = {field: string; value: number | null; placeholder?: string};
type Cell = Fixed | Editable | null;
type Dims = Fixed | {fields: Editable[]};
type Row = {
  key: string; del: {kind: 'export' | 'expiry'; key: string} | null; pn: string; name: string; erpBarcode: string; barcode: string; warehouse: string;
  priority: {key: string; value: number} | null; avail: string; alloc: string; diff: {text: string; short: boolean} | null; vendor: string;
  inc: {key: string; date: string}[]; incQty: string; lot: {text: string; key: string} | null; expiry: string; expiryQty: string;
  outDims: Dims; outWeight: Cell; outCount: Cell; inDims: Dims; inWeight: Cell; inCount: Cell; prodDims: Dims; prodWeight: Cell;
  boxesNeeded: string; remainder: {text: string; warn?: boolean; muted?: boolean}; totalWeight: string; actualBoxes: string; maxBoxes: string;
  pltNumber: string; pltWeight: string; pltDims: string;
};
export type ExportModel = {rows: Row[]; mixed: boolean; cols: [string, string][]; summary: null | Record<string, number | string>; packing: null | {index: number; items: {pn: string; pct: number}[]; used: number; full: boolean; weight: string}[]};

// 숫자 칸 (오른쪽 정렬)
const NUM = new Set(['priority', 'avail', 'alloc', 'needed', 'diff', 'incQty', 'expiryQty', 'outWeight', 'outCount', 'inWeight', 'inCount', 'prodWeight', 'boxesNeeded', 'remainder', 'totalWeight', 'actualBoxes', 'maxBoxes', 'pltWeight']);
// 열 묶음 (기존은 머리글 글자색으로 구분 → 묶음 이름 줄)
const GROUPS: [string, string[]][] = [
  ['', ['del', 'pn', 'name']],
  ['바코드 · 창고 · 배분', ['erpBarcode', 'barcode', 'warehouse', 'priority', 'avail', 'alloc', 'needed', 'diff', 'vendor']],
  ['입고예정', ['incDate', 'incQty']],
  ['유통기한', ['lot', 'expiry', 'expiryQty']],
  ['박스 정보', ['outDims', 'outWeight', 'outCount', 'inDims', 'inWeight', 'inCount', 'prodDims', 'prodWeight']],
  ['PLT 계산', ['boxesNeeded', 'remainder', 'totalWeight', 'actualBoxes', 'maxBoxes', 'pltNumber', 'pltWeight', 'pltDims']],
];
const STICKY = ['del', 'pn', 'name']; // 왼쪽 고정 3칸 (휴대폰은 품번만)

/** 박스 규격 · 무게 · 입수 입력 (파일에 없는 값). 입력을 마치면 저장 (기존 setBoxDim) — 품목 카드와 다운로드 목록이 같은 값을 보여 줌 */
export function BoxNum({pn, f, label}: {pn: string; f: Editable; label: string}) {
  return (
    <span className="box-num">
      <NumberInput label={label} isLabelHidden size="sm" placeholder={f.placeholder || label} value={f.value} onChange={n => { setBoxDim(pn, f.field, n === null ? '' : String(n)); emit(); }} />
    </span>
  );
}
export function BoxDims({pn, dims, label}: {pn: string; dims: Dims; label: string}) {
  if ('fixed' in dims) return <>{dims.fixed}</>;
  return (
    <HStack gap={1} vAlign="center" wrap="nowrap">
      {dims.fields.map((f, k) => <span key={f.field} className="dim-part">{k > 0 && <span aria-hidden>×</span>}<BoxNum pn={pn} f={f} label={`${label} ${f.placeholder}(mm)`} /></span>)}
    </HStack>
  );
}
const boxCell = (pn: string, c: Cell, label: string, ph: string) => (c === null ? '-' : 'fixed' in c ? c.fixed : <BoxNum pn={pn} f={{...c, placeholder: ph}} label={label} />);

/* ---------------- 다운로드 목록 (기존 renderExportPanel) ---------------- */
export function ExportPanel() {
  const m = exportPanelModel() as ExportModel;
  if (m.rows.length === 0) return null;
  return (
    <section id={EXPORT_ANCHOR} className="scroll-anchor">
      <Card padding={0} className="export-card">
        <div className="export-head">
          <Heading level={2}>다운로드 목록 ({fmt(m.rows.length)})</Heading>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button label="전체 지우기" size="sm" variant="ghost" onClick={act.clearExport} />
          </HStack>
        </div>
        <ExportTable m={m} />
      </Card>
    </section>
  );
}

function ExportTable({m}: {m: ExportModel}) {
  const keys = m.cols.map(([k]) => k);
  const left = (k: string) => (k === 'pn' ? exportColWidth('del') : k === 'name' ? exportColWidth('del') + exportColWidth('pn') : 0);
  const sticky = (k: string) => (STICKY.includes(k) ? {className: `sticky-col sticky-${k}`, style: {insetInlineStart: left(k)}} : {className: '', style: {}});
  const cls = (k: string) => [sticky(k).className, NUM.has(k) ? 'num' : ''].filter(Boolean).join(' ') || undefined;
  const total = keys.reduce((s, k) => s + exportColWidth(k), 0);
  return (
    <Table className="sticky-first export-table fixed-cols" density="compact" dividers="rows" style={{tableLayout: 'fixed', width: total, minWidth: total}}>
      <colgroup>{keys.map(k => <col key={k} style={{width: exportColWidth(k)}} />)}</colgroup>
      <TableHeader>
        <TableRow className="group-row">
          {GROUPS.map(([label, ks]) => {
            const n = ks.filter(k => keys.includes(k)).length;
            // 묶음 칸은 여러 열에 걸쳐서 Astryx 머리글 칸(colSpan 없음) 대신 같은 class 의 th
            return label ? <th key={label} colSpan={n} scope="colgroup" className="astryx-table-header-cell group-head">{label}</th>
              : <th key="lead" colSpan={n} className="astryx-table-header-cell sticky-col sticky-group" style={{insetInlineStart: 0}}><span className="sr-only">품목</span></th>;
          })}
        </TableRow>
        <TableRow>
          {m.cols.map(([k, label]) => (
            <TableHeaderCell key={k} className={cls(k)} style={sticky(k).style}>
              {label || <span className="sr-only">삭제</span>}
              <ResizeHandle col={k} label={label || '삭제'} />
            </TableHeaderCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {m.rows.map(r => (
          <TableRow key={r.key}>
            {keys.map(k => <TableCell key={k} className={cls(k)} style={sticky(k).style}>{cell(r, k)}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const dash = <span className="muted">-</span>;
const Remove = ({label, onClick}: {label: string; onClick: () => void}) => (
  <IconButton label={label} icon={<XMarkIcon width={12} height={12} aria-hidden />} size="sm" variant="ghost" onClick={onClick} className="remove-x" />
);

function cell(r: Row, k: string): ReactNode {
  switch (k) {
    case 'del': return r.del ? <Button label="삭제" size="sm" variant="secondary" onClick={() => act.removeExportRow(r.del!)} /> : null;
    case 'pn': return <code>{r.pn}</code>;
    case 'name': return <span title={r.name}>{r.name}</span>;
    case 'priority': return r.priority ? <SmallNum label={`${r.pn} ${r.warehouse} 우선순위`} value={r.priority.value} min={1} onCommit={v => act.setPriority(r.priority!.key, v)} /> : dash;
    case 'needed': return <NeedCell pn={r.pn} />;
    case 'diff': return r.diff ? <b className={r.diff.short ? 'text-danger' : 'text-safe'}>{r.diff.text}</b> : dash;
    case 'incDate': return r.inc.length ? <span className="chip-list">{r.inc.map(i => <span key={i.key} className="x-item">{i.date}<Remove label={`입고예정 ${i.date} 빼기`} onClick={() => act.removeIncomingItem(i.key)} /></span>)}</span> : dash;
    case 'lot': return r.lot ? <span className="x-item">{r.lot.text}<Remove label={`LOT ${r.lot.text} 빼기`} onClick={() => act.removeExpiryItem(r.lot!.key)} /></span> : dash;
    case 'outDims': return <BoxDims pn={r.pn} dims={r.outDims} label="아웃박스" />;
    case 'inDims': return <BoxDims pn={r.pn} dims={r.inDims} label="인박스" />;
    case 'prodDims': return <BoxDims pn={r.pn} dims={r.prodDims} label="제품" />;
    case 'outWeight': return boxCell(r.pn, r.outWeight, '아웃박스 무게(g)', '무게(g)');
    case 'outCount': return boxCell(r.pn, r.outCount, '아웃박스 입수', '입수');
    case 'inWeight': return boxCell(r.pn, r.inWeight, '인박스 무게(g)', '무게(g)');
    case 'inCount': return boxCell(r.pn, r.inCount, '인박스 입수', '입수');
    case 'prodWeight': return boxCell(r.pn, r.prodWeight, '제품 무게(g)', '무게(g)');
    case 'remainder': return r.remainder.text === '-' ? dash : <span className={r.remainder.warn ? 'text-warn' : r.remainder.muted ? 'muted' : undefined}>{r.remainder.text}</span>;
    case 'pltWeight': return r.pltWeight === '-' ? dash : <b>{r.pltWeight}</b>;
    default: {
      const v = (r as unknown as Record<string, string>)[k];
      return v === '-' ? dash : v;
    }
  }
}

/** 표 안의 숫자 입력 (입력을 마치면 반영) */
function SmallNum({label, value, min, onCommit}: {label: string; value: number | null; min?: number; onCommit: (v: string) => void}) {
  return (
    <span className="cell-num">
      <NumberInput label={label} isLabelHidden size="sm" min={min} placeholder="0" value={value} onChange={n => onCommit(n === null ? '' : String(n))} />
    </span>
  );
}
function NeedCell({pn}: {pn: string}) {
  const ext = (ui.neededQty.get(pn) as number | undefined) ?? null;
  return <SmallNum label={`${pn} 필요수량`} value={ext} onCommit={v => act.setNeededQty(pn, v)} />;
}

/** 열 너비 조절 손잡이 (기존 col-resize-handle): 머리글 오른쪽 끝을 끌기. 키보드는 ← → (10px) */
function ResizeHandle({col, label}: {col: string; label: string}) {
  const [drag, setDrag] = useState<{x: number; w: number} | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => act.setExportColWidth(col, drag.w + e.clientX - drag.x);
    const up = () => setDrag(null);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  }, [drag, col]);
  return (
    <span
      className={'col-resize-handle' + (drag ? ' is-resizing' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} 열 너비`}
      aria-valuenow={exportColWidth(col)}
      tabIndex={0}
      onPointerDown={(e: ReactPointerEvent) => { e.preventDefault(); setDrag({x: e.clientX, w: exportColWidth(col)}); }}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); act.setExportColWidth(col, exportColWidth(col) + (e.key === 'ArrowRight' ? 10 : -10)); }
      }}
    />
  );
}
