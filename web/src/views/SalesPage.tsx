import {useState, type KeyboardEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Popover} from '@astryxdesign/core/Popover';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Table, TableBody, TableCell, TableFooter, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {MagnifyingGlassIcon} from '@heroicons/react/16/solid';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {useStore} from '../app/useStore';
import {state, ui} from '../lib/store.js';
import {customerTableModel, customerTotals, isCurrentPeriod, mselItems, periodGaps, skuSearchMatches, skuStatusModel} from '../lib/views.js';
import {useScrollRecent} from '../app/useNarrow';
import {productList, skuMonthLabel, skuStatusCsv} from '../lib/sales.js';
import * as act from '../lib/actions.js';
import {fmt} from '../lib/format';
import {saveCsv} from '../lib/saveCsv';

// 분기 구분: 색(기존 QUARTER_COLORS) 대신 연도 머리글 + 연도가 바뀌는 열의 왼쪽 선. 색은 상태 · 브랜드에만 씀
const yearOf = (q: string) => q.slice(0, 4);
/** 없는 값(판매 기록 없음)은 '-', 실제 0 은 0 (둘 다 흐리게) */
const qtyCell = (v: number | undefined) => (v === undefined ? '-' : fmt(v));
const qtyClass = (v: number | undefined, extra = '') => `num${v ? '' : ' muted'}${extra}`;

/* 기간 열 표시: 데이터에 판매가 전혀 없는 기간은 빗금 친 좁은 열, 아직 끝나지 않은 이번 달(분기)은 '집계 중' */
type Unit = '개월' | '분기';
function GapHead({n, unit, year}: {n: number; unit: Unit; year?: boolean}) {
  return (
    <TableHeaderCell className="gap-col" style={{width: 56}}>
      {year && <span className="q-year" />}
      <span title={`${n}${unit} 동안 판매 데이터가 없습니다`}>{n}{unit} 없음</span>
    </TableHeaderCell>
  );
}
const GapCell = () => <TableCell className="gap-col" />;
const CUR_TITLE = '아직 끝나지 않은 기간이라 판매가 더 늘어날 수 있습니다';
function PeriodLegend({gaps, current, unit}: {gaps: boolean; current: boolean; unit: string}) {
  return (
    <div className="legend">
      <Text type="supporting">- 판매 기록 없음 · 0 판매 기록은 있으나 합계 0</Text>
      {gaps && <Text type="supporting"><span className="legend-gap" aria-hidden /> 데이터에 판매가 전혀 없는 기간</Text>}
      {current && <Text type="supporting"><span className="legend-partial" aria-hidden /> 집계 중: 아직 끝나지 않은 이번 {unit}</Text>}
    </div>
  );
}

let subview: 'customer' | 'skustatus' = 'customer'; // 기존처럼 다른 화면에 다녀와도 마지막 보기 유지

export function SalesPage() {
  useStore();
  const [, rerender] = useState(0);
  return (
    <PageFrame view="customer">
      {!state.loaded ? (
        <NoData />
      ) : (
        <VStack gap={4}>
          <TabList role="tablist" size="sm" hasDivider value={subview} onChange={v => { subview = v as typeof subview; rerender(n => n + 1); }}>
            <Tab value="customer" label="거래처별" panelId="sales-panel" />
            <Tab value="skustatus" label="품목별" panelId="sales-panel" />
          </TabList>
          <div id="sales-panel" role="tabpanel" aria-label={subview === 'customer' ? '거래처별' : '품목별'}>
            {subview === 'customer' ? <CustomerView /> : <SkuView />}
          </div>
        </VStack>
      )}
    </PageFrame>
  );
}

/* ---------------- 거래처별: 품목 × 분기 표 ---------------- */

function CustomerView() {
  const m = customerTableModel();
  const picked = ui.custSelected.size + ui.pnSelected.size;
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <MselPicker which="cust" />
        <MselPicker which="pn" />
        <div className="grow-field">
          <TextInput label="품번 / 품명 검색" isLabelHidden placeholder="품번 / 품명 검색" size="sm" startIcon={MagnifyingGlassIcon} hasClear value={ui.customerPnSearch} onChange={act.setCustomerPnSearch} />
        </div>
      </HStack>
      {/* 고른 거래처 · 품번을 칩으로 (팝오버를 닫아도 무엇을 골랐는지 보임) + 표 행 수 */}
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text type="supporting">{m.groupByCust ? `${fmt(m.rows.length)}개 행` : `${fmt(m.rows.length)}개 품목`}</Text>
        {[...ui.custSelected].map((c: string) => <Token key={'c' + c} size="sm" label={c} onRemove={() => act.toggleCustomer(c, false)} />)}
        {[...ui.pnSelected].map((pn: string) => <Token key={'p' + pn} size="sm" label={pn} onRemove={() => act.removePnChip(pn)} />)}
        {picked > 0 && <Button label="선택 해제" size="sm" variant="ghost" onClick={() => { act.mselClear('cust'); act.mselClear('pn'); }} />}
      </HStack>
      <CustomerTable m={m} />
    </VStack>
  );
}

/** 거래처 / 품번 다중 선택 (기존 msel 패널) */
function MselPicker({which}: {which: 'cust' | 'pn'}) {
  const isCust = which === 'cust';
  const label = isCust ? '거래처' : '품번';
  const selected: Set<string> = isCust ? ui.custSelected : ui.pnSelected;
  const {items, total} = mselItems(which);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isCust && e.key === 'Enter') { e.preventDefault(); act.pnEnter((e.target as HTMLInputElement).value); }
  };
  const content = (
    <VStack gap={2} padding={3}>
      {!isCust && selected.size > 0 && (
        <HStack gap={1} wrap="wrap">
          {[...selected].map(pn => <Token key={pn} size="sm" label={pn} onRemove={() => act.removePnChip(pn)} />)}
        </HStack>
      )}
      <TextInput
        label={`${label} 검색`}
        isLabelHidden
        size="sm"
        placeholder={isCust ? '거래처 검색' : '품번 입력 후 Enter (예: SB1344, 여러 개 가능)'}
        value={isCust ? ui.custMselSearch : ui.pnMselSearch}
        onChange={isCust ? act.setCustMselSearch : act.setPnMselSearch}
        onKeyDown={onKeyDown}
      />
      <HStack hAlign="between" vAlign="center">
        <Text type="supporting">{selected.size > 0 ? `${fmt(selected.size)}개 선택` : '선택 없음 = 전체'}</Text>
        {selected.size > 0 && <Button label="선택 해제" size="sm" variant="ghost" onClick={() => act.mselClear(which)} />}
      </HStack>
      <div className="msel-list">
        {items.length === 0 ? (
          <Text type="supporting">일치하는 항목이 없습니다.</Text>
        ) : (
          items.map((it: {key: string; label: string}) => (
            <CheckboxInput
              key={it.key}
              size="sm"
              label={it.label}
              value={selected.has(it.key)}
              onChange={checked => (isCust ? act.toggleCustomer(it.key, checked) : act.togglePn(it.key))}
            />
          ))
        )}
        {total > items.length && <Text type="supporting">검색어를 더 입력하면 좁혀집니다 ({fmt(total - items.length)}개 더 있음)</Text>}
      </div>
    </VStack>
  );
  return (
    <Popover content={content} label={`${label} 선택`} width={360}>
      <Button
        label={selected.size === 0 ? `${label} 전체` : `${label} ${selected.size}개 선택`}
        size="sm"
        variant="secondary"
        endContent={<Icon icon="chevronDown" />}
      />
    </Popover>
  );
}

// 거래처별 열 너비(px). 품명은 지정하지 않아 남는 너비를 씀 (표 최소 너비에는 CW.name 만큼)
const CW = {pn: 100, brand: 108, name: 180, avail: 84, cust: 120, q: 76, total: 88};

interface PivotRow {품번: string; 품명: string; brand: string; 거래처: string | null; quarters: Map<string, number>; total: number; available: number}

function CustomerTable({m}: {m: ReturnType<typeof customerTableModel>}) {
  const scrollRef = useScrollRecent(m.quarterCols.join() + m.groupByCust);
  if (m.rows.length === 0) return <EmptyState isCompact title="데이터가 없습니다." />;
  const shown: PivotRow[] = m.rows.slice(0, ui.customerPage);
  // 거래처 2개 이상: 같은 품번 행을 묶어서 품번 · 브랜드 · 품명 · 가용재고를 한 번만 (rowSpan)
  const groupSize = (k: number) => { let j = k; while (j < shown.length && shown[j].품번 === shown[k].품번) j++; return j - k; };
  let groupIdx = -1;
  const t = customerTotals(m);
  const ystart = (i: number) => (i > 0 && yearOf(m.quarterCols[i]) !== yearOf(m.quarterCols[i - 1]) ? ' ystart' : '');
  const gaps: number[] = periodGaps(m.quarterCols);
  const cur = (q: string) => (isCurrentPeriod(q) ? ' partial' : '');
  // 기간 칸 하나 (앞에 빠진 기간이 있으면 빗금 칸을 먼저)
  const periodCells = (cell: (q: string, i: number) => React.ReactNode) => m.quarterCols.flatMap((q: string, i: number) => [gaps[i] > 0 && <GapCell key={'g' + q} />, cell(q, i)]);
  return (
    <VStack gap={2}>
      {/* 좁은 화면에서는 칸을 찌그러뜨리지 않고 옆으로 스크롤 (휴대폰은 최근 분기 쪽에서 시작) */}
      <div ref={scrollRef}>
      <Card padding={0} className="flush">
        {/* 열 너비 고정 (품명은 남는 너비): 자동 배치는 브랜드 · 품번을 말줄임으로 찌그러뜨림 */}
        <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: CW.pn + CW.brand + CW.name + CW.avail + (m.groupByCust ? CW.cust : 0) + m.quarterCols.length * CW.q + gaps.filter(Boolean).length * 56 + CW.total}}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className="sticky-col" style={{width: CW.pn}}>품번</TableHeaderCell>
              <TableHeaderCell className="hide-narrow" style={{width: CW.brand}}>브랜드</TableHeaderCell>
              <TableHeaderCell>품명</TableHeaderCell>
              {/* 운영 화면은 여기서 머리글이 '거래처 · 가용재고' 순서였지만 실제 칸은 '가용재고 · 거래처' 순서여서 머리글을 칸에 맞춤 */}
              <TableHeaderCell className="num" style={{width: CW.avail}}>가용재고</TableHeaderCell>
              {m.groupByCust && <TableHeaderCell style={{width: CW.cust}}>거래처</TableHeaderCell>}
              {/* 연도는 그 해 첫 분기 칸 위에만 (예: 2026 / Q1), 연도가 바뀌는 열 왼쪽에 선 */}
              {m.quarterCols.flatMap((q: string, i: number) => [
                gaps[i] > 0 && <GapHead key={'g' + q} n={gaps[i]} unit="분기" year />,
                <TableHeaderCell key={q} className={'num q-head' + ystart(i) + cur(q)} style={{width: CW.q}}>
                  <span className="q-year">{i === 0 || ystart(i) ? yearOf(q) : ''}</span>
                  <span title={cur(q) ? CUR_TITLE : undefined}>{q.slice(5)}</span>
                  {cur(q) && <span className="q-note">집계 중</span>}
                </TableHeaderCell>,
              ])}
              <TableHeaderCell className="num" style={{width: CW.total}}>합계</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, k) => {
              const first = !m.groupByCust || k === 0 || shown[k - 1].품번 !== r.품번;
              if (first) groupIdx++;
              const span = m.groupByCust && first ? groupSize(k) : undefined;
              return (
                <TableRow key={r.품번 + '|' + (r.거래처 || '')} className={m.groupByCust && groupIdx % 2 === 1 ? 'group-alt' : undefined}>
                  {first && (
                    <>
                      <TableCell rowSpan={span} className="sticky-col"><code>{r.품번}</code></TableCell>
                      <TableCell rowSpan={span} className="hide-narrow"><BrandBadge brand={r.brand} /></TableCell>
                      <TableCell rowSpan={span} className="name-cell">{r.품명}<span className="show-narrow"><BrandBadge brand={r.brand} /></span></TableCell>
                    </>
                  )}
                  {m.groupByCust && first && <TableCell rowSpan={span} className="num">{fmt(r.available)}</TableCell>}
                  {m.groupByCust && <TableCell><Text type="supporting">{r.거래처}</Text></TableCell>}
                  {!m.groupByCust && <TableCell className="num">{fmt(r.available)}</TableCell>}
                  {periodCells((q, i) => {
                    const v = r.quarters.get(q);
                    return <TableCell key={q} className={qtyClass(v, ystart(i) + cur(q))}>{qtyCell(v)}</TableCell>;
                  })}
                  <TableCell className="num strong">{fmt(r.total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {/* 판매 합계: 더 보기로 아직 안 보인 행까지 포함한 전체. 가용재고는 서로 다른 품목이라 더하지 않음 (customerTotals) */}
          <TableFooter>
            <TableRow>
              <TableCell className="sticky-col strong">합계</TableCell>
              <TableCell className="hide-narrow" />
              <TableCell><Text type="supporting">{shown.length < m.rows.length ? `전체 ${fmt(m.rows.length)}개 행` : ''}</Text></TableCell>
              <TableCell />
              {m.groupByCust && <TableCell />}
              {periodCells((q, i) => {
                const v = t.quarters.get(q);
                return <TableCell key={q} className={qtyClass(v, ystart(i) + cur(q)) + ' strong'}>{qtyCell(v)}</TableCell>;
              })}
              <TableCell className="num strong">{fmt(t.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
      </div>
      <PeriodLegend gaps={gaps.some(Boolean)} current={m.quarterCols.some(isCurrentPeriod)} unit="분기" />
      {m.rows.length > shown.length && (
        <HStack hAlign="center">
          <Button label={`더 보기 (${fmt(m.rows.length - shown.length)}개 더)`} variant="secondary" onClick={act.customerMore} />
        </HStack>
      )}
    </VStack>
  );
}

/* ---------------- 품목별: 선택한 품번의 거래처 × 월 표 ---------------- */

function SkuView() {
  const [open, setOpen] = useState(false);
  const matches: {pn: string; name: string}[] | null = skuSearchMatches(); // Enter 가 쓰는 검색 결과 목록도 함께 갱신
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'TEXTAREA') {
      e.preventDefault();
      act.skuEnter();
      setOpen(false);
    }
  };
  return (
    <VStack gap={3}>
      <div
        className="sku-search"
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
        <TextArea
          label="품번 / 품명 검색"
          isLabelHidden
          rows={2}
          placeholder="품번 / 품명 검색 — 여러 개는 줄바꿈 · 쉼표로 구분해서 붙여넣기"
          value={ui.skuStatusSearch}
          onChange={v => { act.setSkuSearch(v); setOpen(true); }}
        />
        <Text type="supporting">Enter: 검색된 품번을 모두 선택(합산) · Shift+Enter: 줄바꿈</Text>
        {/* 검색 결과는 입력칸 아래에 떠서 표를 밀어내지 않음 */}
        {open && matches && (
          <Card padding={2} className="sku-matches">
            {matches.length === 0 ? (
              <Text type="supporting">일치하는 품번/품명이 없습니다.</Text>
            ) : (
              <VStack gap={1}>
                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting">{fmt(matches.length)}건 매칭</Text>
                  <Button label="이 결과 전체 추가" size="sm" variant="ghost" onClick={act.pickAllSku} />
                </HStack>
                <div className="msel-list">
                  {matches.map(p => (
                    <CheckboxInput key={p.pn} size="sm" label={`${p.pn} · ${p.name || '-'}`} value={ui.skuStatusSelected.has(p.pn)} onChange={() => act.toggleSku(p.pn)} />
                  ))}
                </div>
              </VStack>
            )}
          </Card>
        )}
      </div>
      <SkuTable />
    </VStack>
  );
}

function SkuTable() {
  const scrollRef = useScrollRecent([...ui.skuStatusSelected].join());
  if (ui.skuStatusSelected.size === 0) {
    return <EmptyState isCompact title="품번(품명)을 검색해서 하나 이상 선택해주세요." description="여러 개 선택하면 합산해서 보여줍니다." />;
  }
  const names = new Map(productList().map((p: {pn: string; name: string}) => [p.pn, p.name]));
  const s = skuStatusModel();
  const gaps: number[] = periodGaps(s.months);
  const cur = (mk: string) => (isCurrentPeriod(mk) ? ' partial' : '');
  const monthCells = (cell: (mk: string, i: number) => React.ReactNode) => s.months.flatMap((mk: string, i: number) => [gaps[i] > 0 && <GapCell key={'g' + mk} />, cell(mk, i)]);
  return (
    <VStack gap={3}>
      <HStack gap={1} wrap="wrap" vAlign="center">
        {[...ui.skuStatusSelected].map((pn: string) => (
          <Token key={pn} size="sm" label={`${pn} · ${names.get(pn) || ''}`} onRemove={() => act.removeSku(pn)} />
        ))}
        <Button label="선택 해제" size="sm" variant="ghost" onClick={act.clearSku} />
      </HStack>
      {ui.skuStatusSelected.size > 1 && <Text type="supporting">선택한 {fmt(ui.skuStatusSelected.size)}개 품번을 합산한 수량입니다.</Text>}
      {s.custList.length === 0 ? (
        <EmptyState isCompact title="선택한 품번의 판매 이력이 없습니다." />
      ) : (
        <>
          <HStack>
            <Button label="CSV 다운로드" variant="secondary" size="sm" icon={<Icon icon="arrowDown" />} onClick={() => saveCsv(skuStatusCsv())} />
          </HStack>
          <div ref={scrollRef}>
          <Card padding={0} className="flush">
            <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 200 + s.months.length * 64 + gaps.filter(Boolean).length * 56 + 92}}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className="sticky-col" style={{width: 200}}>거래처</TableHeaderCell>
                  {s.months.flatMap((mk: string, i: number) => [
                    gaps[i] > 0 && <GapHead key={'g' + mk} n={gaps[i]} unit="개월" />,
                    <TableHeaderCell key={mk} className={'num' + cur(mk)} style={{width: 64}}>
                      <span title={cur(mk) ? CUR_TITLE : undefined}>{skuMonthLabel(mk, s.singleYear)}</span>
                      {cur(mk) && <span className="q-note">집계 중</span>}
                    </TableHeaderCell>,
                  ])}
                  <TableHeaderCell className="num" style={{width: 92}}>합계</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.rows.map((r: {cust: string; values: number[]; total: number}) => (
                  <TableRow key={r.cust}>
                    <TableCell className="sticky-col">{r.cust}</TableCell>
                    {/* 그 달 판매 기록이 없으면 '-', 기록이 있고 합이 0 이면 0 */}
                    {monthCells((mk, i) => { const v = s.byCust.get(r.cust).has(mk) ? r.values[i] : undefined; return <TableCell key={mk} className={qtyClass(v, cur(mk))}>{qtyCell(v)}</TableCell>; })}
                    <TableCell className="num strong">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky-col strong">합계</TableCell>
                  {monthCells((mk, i) => { const v = s.custList.some((c: string) => s.byCust.get(c).has(mk)) ? s.monthTotals[i] : undefined; return <TableCell key={mk} className={qtyClass(v, cur(mk)) + ' strong'}>{qtyCell(v)}</TableCell>; })}
                  <TableCell className="num strong">{fmt(s.grandTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
          </div>
          <PeriodLegend gaps={gaps.some(Boolean)} current={s.months.some(isCurrentPeriod)} unit="달" />
        </>
      )}
    </VStack>
  );
}
