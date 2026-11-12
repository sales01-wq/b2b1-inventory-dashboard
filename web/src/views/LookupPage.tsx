import {useEffect, useRef, useState, type MouseEvent, type ReactNode} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {ChevronUpIcon, ListBulletIcon, SparklesIcon} from '@heroicons/react/16/solid';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {useStore} from '../app/useStore';
import {useDragScroll} from '../app/useDragScroll';
import {state, ui} from '../lib/store.js';
import {brandOf} from '../lib/forecast.js';
import {buildExportRows, productNeedDiff, selectionSummaryFor} from '../lib/lookup.js';
import {boxCompactRows, boxModel, expiryRows, incomingChips, warehouseRows} from '../lib/views.js';
import {setBoxDim} from '../data/settings.js';
import * as act from '../lib/actions.js';
import {fmt} from '../lib/format';

// 제품일정표 한 행 (조회 결과의 품목 · 대체 품번)
type Row = {품번: string; 품명: string; 바코드: string; 거래처: string; aug_q: number; sep_q: number; oct_q: number; aug_d: string; sep_d: string; oct_d: string};
type Item = {status: 'resolved' | 'notfound' | 'truncated'; barcode?: string; nameQuery?: string; row?: Row; alternatives?: Row[]; extra?: number};
type WhRow = {창고: string; 가용재고: number; 현재고: number; 입고예정: number; 출고예정: number; picked: boolean};
type Lot = {lot: string; date: string; avail: number; picked: boolean};
type Chip = {m: string; d: string; q: number; picked: boolean};

export const EXPORT_ANCHOR = 'lookup-export';

export function LookupPage() {
  useStore();
  const ref = useRef<HTMLDivElement>(null);
  useDragScroll(ref);
  return (
    <PageFrame view="lookup">
      <div ref={ref}>
        {state.loaded ? (
          <VStack gap={5}>
            <SearchForm />
            <Results />
            <ExportAnchor />
          </VStack>
        ) : (
          <NoData />
        )}
      </div>
    </PageFrame>
  );
}

/* ---------------- 조회 입력 (기존 lookupForm) ---------------- */
function SearchForm() {
  const custRef = useRef<HTMLInputElement>(null);
  useEffect(() => { custRef.current?.setAttribute('list', 'lookup-customers'); }, []); // 거래처 이름 제안 (기존 datalist)
  return (
    <Card padding={4}>
      <form
        className="lookup-form"
        onSubmit={e => { e.preventDefault(); act.lookupSearch(); }}>
        <div className="lookup-area">
          <TextArea
            label="바코드 / 품번"
            rows={2}
            placeholder={'예: SB1344 500\n8800253026947, SB1344'}
            value={ui.lookupBarcodeText}
            onChange={v => act.setLookupText('lookupBarcodeText', v)}
          />
        </div>
        <div className="lookup-area">
          <TextArea
            label="품명 검색 (부분 일치)"
            rows={2}
            placeholder={'예: 크림인세럼, 틴트글로우\n정확한 전체 품명 아니어도 됩니다'}
            value={ui.lookupNameText}
            onChange={v => act.setLookupText('lookupNameText', v)}
          />
        </div>
        <div className="lookup-customer">
          <TextInput
            ref={custRef}
            label="거래처 (전체에 동일 적용)"
            placeholder="예: UNLOCKT BRANDS INC"
            value={ui.lookupCustomerText}
            onChange={v => act.setLookupText('lookupCustomerText', v)}
          />
          <datalist id="lookup-customers">{(state.customers as string[]).map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <HStack gap={2} vAlign="center" className="lookup-actions">
          <Button type="submit" label="조회" variant="primary" />
          <Button label="바코드 지우기" variant="ghost" onClick={act.clearLookupBarcode} />
        </HStack>
      </form>
      <div className="lookup-help">
        <Collapsible defaultIsOpen={false} trigger={<Text type="supporting" weight="medium">입력 방법</Text>}>
          <ul className="help-list">
            <li>PO에 찍힌 바코드나 대략적인 품명을 넣으면, 그 거래처에 실제로 출고했던 품번 · 품명과 창고별 가용재고 · 유통기한 · 입고예정을 함께 보여 줍니다.</li>
            <li>바코드 / 품번은 줄바꿈이나 쉼표로 여러 개를 넣을 수 있고, 뒤에 숫자를 붙이면 필요 수량으로 읽습니다 (엑셀에서 바코드 · 수량 두 칸을 복사해 붙여도 됩니다).</li>
            <li>품명은 일부만 넣어도 되고 여러 개를 넣을 수 있습니다 (검색어마다 최대 20개 표시).</li>
            <li>거래처를 넣으면 그 거래처에 출고했던 품번을 먼저 찾습니다. 성분에디터 · 밀크터치 · 마미케어 품번만 검색됩니다.</li>
          </ul>
        </Collapsible>
      </div>
    </Card>
  );
}

/* ---------------- 조회 결과 (기존 renderLookupBatch) ---------------- */
function Results() {
  const items = ui.lookupItems as Item[];
  if (items.length === 0) return null;
  const resolved = items.filter(x => x.status === 'resolved').length;
  const notFound = items.filter(x => x.status === 'notfound').length;
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap" className="lookup-toolbar">
        <Text type="label">
          조회 결과 <b>{fmt(resolved)}개 품목</b>
          {notFound > 0 && <> · <span className="text-danger">못 찾음 {fmt(notFound)}건</span></>}
        </Text>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <SelectedJump />
          {resolved > 0 && (
            <CheckboxInput size="sm" label="추천 선택 시 대체품목(동일 바코드 다른 품번)도 함께 담기" value={!!ui.autoSelectIncludeAlternatives} onChange={act.setAutoSelectAlternatives} />
          )}
          {resolved > 1 && (
            <Button label={`전체 추천 선택 (${fmt(resolved)}개 품목)`} variant="secondary" size="sm" icon={<SparklesIcon width={14} height={14} aria-hidden />} onClick={act.autoSelectAll} />
          )}
        </HStack>
      </HStack>
      {items.map((item, i) => <ResultItem key={i} item={item} idx={i} />)}
    </VStack>
  );
}

/** 선택 항목 보기: 다운로드 목록(아래)으로 이동. 담긴 행이 있을 때만 */
function SelectedJump() {
  const n = buildExportRows().length;
  if (n === 0) return null;
  return (
    <Button
      label={`선택 항목 보기 (${fmt(n)})`}
      variant="secondary"
      size="sm"
      icon={<ListBulletIcon width={14} height={14} aria-hidden />}
      onClick={() => document.getElementById(EXPORT_ANCHOR)?.scrollIntoView({behavior: 'smooth', block: 'start'})}
    />
  );
}

/* 2단계 전까지 다운로드 목록 자리 (선택 항목 보기의 이동 위치) */
function ExportAnchor() {
  const n = buildExportRows().length;
  if (n === 0) return null;
  return (
    <section id={EXPORT_ANCHOR} className="scroll-anchor">
      <Card padding={4}>
        <VStack gap={1}>
          <Heading level={2}>다운로드 목록 ({fmt(n)})</Heading>
          <Text type="supporting">다운로드 목록 표 · PLT 계산 · 엑셀 다운로드는 2단계에서 옮깁니다.</Text>
        </VStack>
      </Card>
    </section>
  );
}

function ResultItem({item, idx}: {item: Item; idx: number}) {
  const isName = item.nameQuery !== undefined;
  const query = isName ? item.nameQuery : item.barcode;
  if (item.status === 'truncated') {
    return <div className="alert alert-note" role="status"><Text type="label">'{item.nameQuery}' 검색 결과가 더 있습니다 ({fmt(item.extra || 0)}개 더). 검색어를 조금 더 구체적으로 입력하면 좁혀집니다.</Text></div>;
  }
  if (item.status === 'notfound') {
    return (
      <Card padding={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Icon icon="warning" color="error" size="sm" />
          <Text type="label">
            <QueryLabel isName={isName} query={query} />{' '}
            {isName ? `'${item.nameQuery}'가 포함된 품명을 제품일정표에서 찾지 못했습니다.` : '해당 바코드/품번으로 제품일정표에서 일치하는 품목을 찾지 못했습니다. 다시 확인해주세요.'}
          </Text>
        </HStack>
      </Card>
    );
  }
  return <ProductCard row={item.row!} alternatives={item.alternatives || []} idx={idx} query={<QueryLabel isName={isName} query={query} />} />;
}

function QueryLabel({isName, query}: {isName: boolean; query?: string}) {
  return <span className="query-label">{isName ? '품명 검색' : '입력'} <code>{query}</code></span>;
}

/* ---------------- 품목 카드 (기존 renderResultBlock: 5개 패널 + 오른쪽 대체 품번 칸 → 카드 하나) ---------------- */
function ProductCard({row, alternatives, idx, query}: {row: Row; alternatives: Row[]; idx: number; query: ReactNode}) {
  const active = ui.activeBatchIdx === idx;
  // 카드 머리를 누르면 '선택됨' 표시 (기존 toggle-product). 버튼 · 입력칸을 누른 경우는 제외
  const onHead = (e: MouseEvent) => { if (!(e.target as Element).closest('button,input,label,a')) act.toggleActiveProduct(idx); };
  if (ui.collapsedItems.has(idx)) {
    return (
      <Card padding={3} className="product-card is-collapsed">
        <div className="product-collapsed" onClick={() => act.toggleCollapse(idx)}>
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center" wrap="wrap"><code className="pn">{row.품번}</code><Text type="label" weight="semibold">{row.품명}</Text></HStack>
            <Text type="supporting">{selectionSummaryFor(row.품번)}</Text>
          </VStack>
          <Button label="펼치기" size="sm" variant="ghost" icon={<Icon icon="chevronDown" />} onClick={() => act.toggleCollapse(idx)} />
        </div>
      </Card>
    );
  }
  const ml = state.scheduleMonthLabels as string[];
  return (
    <Card padding={0} className={'product-card' + (active ? ' is-active' : '')}>
      <div className="product-head" onClick={onHead}>
        <VStack gap={1} className="product-id">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <code className="pn pn-lg">{row.품번}</code>
            <BrandBadge brand={brandOf(row.품번)} />
            {active && <Badge variant="green" label="선택됨" />}
          </HStack>
          <Text type="label" weight="semibold">{row.품명}</Text>
          <Text type="supporting" className="product-meta">
            거래처 {row.거래처 || '-'} · 바코드 <span className="tnum">{row.바코드}</span> · {query}
          </Text>
        </VStack>
        <HStack gap={3} vAlign="end" wrap="wrap" className="product-controls">
          <NeedQty pn={row.품번} />
          <HStack gap={2} vAlign="center">
            <Button label="추천 선택" size="sm" variant="secondary" icon={<SparklesIcon width={14} height={14} aria-hidden />} onClick={() => act.autoSelectOne(idx)} />
            <Button label="선택완료" size="sm" variant="ghost" icon={<ChevronUpIcon width={14} height={14} aria-hidden />} onClick={() => act.toggleCollapse(idx)} />
          </HStack>
        </HStack>
      </div>
      <div className="product-body">
        <section className="product-section">
          <SectionHead title="창고별 가용재고" hint="누르면 다운로드 목록에 담깁니다 · 빼기는 다운로드 목록에서" />
          <WarehouseTable row={row} />
          <Text type="supporting" className="show-narrow">표를 좌우로 밀면 현재고 · 입고예정 · 출고예정이 보입니다</Text>
        </section>
        <section className="product-section">
          <SectionHead title="유통기한 (LOT)" hint="2년 이상 남은 LOT 우선 · 없으면 가장 긴 LOT (주의)" />
          <LotTable row={row} />
        </section>
        <section className="product-section span-all">
          <SectionHead title={`입고예정 (제품일정표 기준, ${ml[0]}~${ml[2]})`} hint="누르면 다운로드 목록의 입고예정 칸에 담깁니다" />
          <IncomingChips row={row} />
        </section>
      </div>
      <div className="product-foot">
        <Collapsible isOpen={ui.masterInfoExpanded.has(row.품번)} onOpenChange={() => act.toggleMasterInfo(row.품번)} trigger={<Text type="label" weight="semibold">아웃박스 · 인박스 · 중량 정보</Text>}>
          <BoxEditor pn={row.품번} />
        </Collapsible>
        <Alternatives alternatives={alternatives} />
      </div>
    </Card>
  );
}

function SectionHead({title, hint}: {title: string; hint: string}) {
  return (
    <div className="section-head">
      <Heading level={3}>{title}</Heading>
      <Text type="supporting">{hint}</Text>
    </div>
  );
}

/** 필요 수량 + 선택 창고 재고 대비 부족/여유 (기존과 같이 입력을 마치면(칸을 벗어나거나 Enter) 반영, 0 · 빈 값이면 지움) */
function NeedQty({pn}: {pn: string}) {
  const ext = (ui.neededQty.get(pn) as number | undefined) ?? null;
  const [v, setV] = useState<number | null>(ext);
  useEffect(() => { setV(ext); }, [ext]);
  const nd = productNeedDiff(pn);
  return (
    <HStack gap={2} vAlign="end">
      <span className="need-input">
        <NumberInput label="필요 수량" size="sm" placeholder="0" value={v} onChange={n => { setV(n); act.setNeededQty(pn, n === null ? '' : String(n)); }} />
      </span>
      {nd.needed > 0 && (
        <span className="need-diff">
          <Text type="supporting">선택 창고 재고 대비</Text>
          <b className={nd.diff < 0 ? 'text-danger' : 'text-safe'}>{nd.diff < 0 ? '' : '+'}{fmt(nd.diff)}개</b>
        </span>
      )}
    </HStack>
  );
}

/* ---------------- 창고 · LOT · 입고예정 (선택 상태: 체크 + '추가됨') ---------------- */
/** 행 전체를 눌러도 되고 체크칸을 눌러도 됨 (한 번만 처리) */
function PickRow({picked, label, onPick, isLocked, children}: {picked: boolean; label: string; onPick: () => void; isLocked?: boolean; children: ReactNode}) {
  return (
    <TableRow
      className={'pick-row' + (picked ? ' is-picked' : '') + (isLocked && picked ? ' is-locked' : '')}
      onClick={(e: MouseEvent) => { if (!(e.target as Element).closest('input,label')) onPick(); }}>
      <TableCell className="pick-cell">
        {/* 창고(isLocked): 다시 눌러도 빠지지 않음 — onPick 이 이미 담긴 창고는 그대로 둠 (기존과 같음) */}
        <CheckboxInput size="sm" label={label} isLabelHidden value={picked} onChange={onPick} />
      </TableCell>
      {children}
    </TableRow>
  );
}

const Added = () => <Badge variant="green" label="추가됨" />;

function WarehouseTable({row, compact}: {row: Row; compact?: boolean}) {
  const w = warehouseRows(row.품번) as {rows: WhRow[]; total: number | null};
  return (
    <div className="pick-scroll">
      <Table className="mini-table pick-table" density="compact" dividers="rows">
        <TableHeader>
          <TableRow>
            <TableHeaderCell className="pick-cell"><span className="sr-only">담기</span></TableHeaderCell>
            <TableHeaderCell>창고</TableHeaderCell>
            <TableHeaderCell className="num">가용재고</TableHeaderCell>
            {!compact && <><TableHeaderCell className="num">현재고</TableHeaderCell><TableHeaderCell className="num">입고예정</TableHeaderCell><TableHeaderCell className="num">출고예정</TableHeaderCell></>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {w.rows.map(r => (
            <PickRow key={r.창고} picked={r.picked} isLocked label={`${r.창고} 담기`} onPick={() => act.pickWarehouse(row, r.창고, r.가용재고)}>
              <TableCell>{r.창고}{r.picked && <> <Added /></>}</TableCell>
              <TableCell className="num">{fmt(r.가용재고)}</TableCell>
              {!compact && <><TableCell className="num">{fmt(r.현재고)}</TableCell><TableCell className="num">{fmt(r.입고예정)}</TableCell><TableCell className="num">{fmt(r.출고예정)}</TableCell></>}
            </PickRow>
          ))}
          {w.total !== null && (
            <TableRow className="total-row">
              <TableCell />
              <TableCell><strong>합계</strong></TableCell>
              <TableCell className="num"><strong>{fmt(w.total)}</strong></TableCell>
              {!compact && <TableCell colSpan={3} />}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function LotTable({row, compact}: {row: Row; compact?: boolean}) {
  const e = expiryRows(row.품번) as {warn: boolean; rows: Lot[]} | null;
  if (!e) return <Empty>유통기한 시트에 가용재고가 있는 LOT이 없습니다.</Empty>;
  return (
    <div className="pick-scroll">
      <Table className="mini-table pick-table" density="compact" dividers="rows">
        <TableHeader>
          <TableRow>
            <TableHeaderCell className="pick-cell"><span className="sr-only">담기</span></TableHeaderCell>
            <TableHeaderCell>LOT</TableHeaderCell>
            <TableHeaderCell>유통기한</TableHeaderCell>
            <TableHeaderCell className="num">{compact ? '가용재고' : '가용재고수량'}</TableHeaderCell>
            {!compact && <TableHeaderCell><span className="sr-only">주의</span></TableHeaderCell>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {e.rows.map(l => (
            <PickRow key={l.lot + l.date} picked={l.picked} label={`LOT ${l.lot} 담기`} onPick={() => act.pickExpiry(row, l)}>
              <TableCell>{l.lot}{l.picked && <> <Added /></>}</TableCell>
              <TableCell>{l.date}</TableCell>
              <TableCell className="num">{fmt(l.avail)}</TableCell>
              {!compact && <TableCell>{e.warn && <Badge variant="yellow" label="2년 미만-주의" />}</TableCell>}
            </PickRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IncomingChips({row}: {row: Row}) {
  const chips = incomingChips(row) as Chip[];
  if (chips.length === 0) return <Empty>예정된 입고가 없습니다.</Empty>;
  return (
    <div className="incoming-chips">
      {chips.map(c => (
        <SelectableCard key={c.m} label={`${c.m} 입고예정 ${fmt(c.q)}개`} isSelected={c.picked} onChange={() => act.pickIncoming(row, c)} padding={2}>
          <VStack gap={0.5}>
            <HStack gap={1} vAlign="center"><Text type="supporting">{c.m} 입고예정</Text>{c.picked && <Added />}</HStack>
            <Text type="supporting">{c.d || '날짜 미정'}</Text>
            <Text type="label" weight="semibold">{fmt(c.q)}개</Text>
          </VStack>
        </SelectableCard>
      ))}
    </div>
  );
}

const Empty = ({children}: {children: ReactNode}) => <div className="empty-box"><Text type="supporting">{children}</Text></div>;

/* ---------------- 박스 · 중량 (기존 productMasterHtml). 파일에 없는 값만 입력, 입력값은 저장(기존 setBoxDim) ---------------- */
type Fixed = {fixed: string};
type Editable = {field: string; value: number | null; placeholder?: string};
function BoxNum({pn, f, label}: {pn: string; f: Editable; label: string}) {
  const [v, setV] = useState<number | null>(f.value);
  return (
    <span className="box-num">
      <NumberInput label={label} isLabelHidden size="sm" placeholder={f.placeholder || label} value={v} onChange={n => { setV(n); setBoxDim(pn, f.field, n === null ? '' : String(n)); }} />
    </span>
  );
}
function BoxEditor({pn}: {pn: string}) {
  const m = boxModel(pn) as {rows: {label: string; dims: Fixed | {fields: Editable[]}; weight: Fixed | Editable; count: Fixed | Editable | null}[]; plt: {kind: string; cells: [string, string][]} | null};
  const cell = (c: Fixed | Editable | null, label: string, ph: string) => (c === null ? '-' : 'fixed' in c ? c.fixed : <BoxNum pn={pn} f={{...c, placeholder: ph}} label={label} />);
  return (
    <VStack gap={3}>
      <Text type="supporting">파일에 값이 없는 칸만 직접 입력할 수 있고, 입력한 값은 저장됩니다.</Text>
      <div className="pick-scroll">
        <Table className="mini-table" density="compact" dividers="rows">
          <TableHeader>
            <TableRow><TableHeaderCell>구분</TableHeaderCell><TableHeaderCell>규격(mm, W×D×H)</TableHeaderCell><TableHeaderCell className="num">무게(g)</TableHeaderCell><TableHeaderCell className="num">입수</TableHeaderCell></TableRow>
          </TableHeader>
          <TableBody>
            {m.rows.map(r => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                <TableCell>
                  {'fixed' in r.dims ? r.dims.fixed : (
                    <HStack gap={1} vAlign="center">
                      {r.dims.fields.map((f, k) => <span key={f.field} className="dim-part">{k > 0 && <span aria-hidden>×</span>}<BoxNum pn={pn} f={f} label={`${r.label} ${f.placeholder}(mm)`} /></span>)}
                    </HStack>
                  )}
                </TableCell>
                <TableCell className="num">{cell(r.weight, `${r.label} 무게(g)`, '무게(g)')}</TableCell>
                <TableCell className="num">{cell(r.count, `${r.label} 입수`, '입수')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {m.plt && (
        <VStack gap={2}>
          <Text type="supporting">파레트(PLT) 정보{m.plt.kind ? ' · ' + m.plt.kind : ''}</Text>
          <div className="plt-info">
            {m.plt.cells.map(([k, v]) => <div key={k}><Text type="supporting">{k}</Text><Text type="label" weight="semibold">{v}</Text></div>)}
          </div>
        </VStack>
      )}
    </VStack>
  );
}

/* ---------------- 동일 바코드 다른 품번 (기존 오른쪽 칸 → 카드 안에서 접고 펼침. 있으면 펼친 채로 시작) ---------------- */
function Alternatives({alternatives}: {alternatives: Row[]}) {
  if (alternatives.length === 0) {
    return <Text type="supporting" className="alt-none">동일 바코드 다른 품번 없음 (바코드가 같은 -1, -2 등의 품번이 없습니다)</Text>;
  }
  return (
    <Collapsible defaultIsOpen trigger={<Text type="label" weight="semibold">동일 바코드 다른 품번 ({fmt(alternatives.length)})</Text>}>
      <div className="alt-list">
        {alternatives.map(a => (
          <div key={a.품번} className="alt-item">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <code className="pn">{a.품번}</code>
              <Text type="label" weight="semibold">{a.품명}</Text>
              <Text type="supporting">거래처 {a.거래처 || '-'} · 바코드 <span className="tnum">{a.바코드}</span></Text>
            </HStack>
            <div className="alt-grid">
              <VStack gap={1}><Heading level={4}>창고</Heading><WarehouseTable row={a} compact /></VStack>
              <VStack gap={1}><Heading level={4}>유통기한 (LOT)</Heading><LotTable row={a} compact /></VStack>
              <VStack gap={1}><Heading level={4}>입고예정</Heading><IncomingChips row={a} /></VStack>
              <VStack gap={1}><Heading level={4}>박스 · 중량</Heading><BoxCompact pn={a.품번} /></VStack>
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function BoxCompact({pn}: {pn: string}) {
  const rows = boxCompactRows(pn) as {label: string; dim: string | null; weight: string | null}[];
  return (
    <div className="pick-scroll">
      <Table className="mini-table" density="compact" dividers="rows">
        <TableHeader><TableRow><TableHeaderCell>구분</TableHeaderCell><TableHeaderCell>규격(mm)</TableHeaderCell><TableHeaderCell className="num">무게(g)</TableHeaderCell></TableRow></TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              {r.dim ? <><TableCell>{r.dim}</TableCell><TableCell className="num">{r.weight}</TableCell></> : <TableCell colSpan={2}><span className="muted">정보 없음</span></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
