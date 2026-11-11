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
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {useStore} from '../app/useStore';
import {state, ui} from '../lib/store.js';
import {customerTableModel, mselItems, shortQuarter, skuSearchMatches, skuStatusModel} from '../lib/views.js';
import {productList, skuMonthLabel, skuStatusCsv} from '../lib/sales.js';
import * as act from '../lib/actions.js';
import {fmt} from '../lib/format';
import {saveCsv} from '../lib/saveCsv';

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
          <TabList role="tablist" value={subview} onChange={v => { subview = v as typeof subview; rerender(n => n + 1); }}>
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
  return (
    <VStack gap={3}>
      <Text type="supporting">품목을 행으로, 분기를 열로 나열한 표입니다. 거래처/품번을 여러 개 선택해서 비교할 수 있습니다.</Text>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <MselPicker which="cust" />
        <MselPicker which="pn" />
        <div className="grow-field">
          <TextInput label="품번 / 품명 검색" isLabelHidden placeholder="품번 / 품명 검색" size="sm" value={ui.customerPnSearch} onChange={act.setCustomerPnSearch} />
        </div>
      </HStack>
      <CustomerTable />
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
      <HStack hAlign="end">
        <Button label="선택 해제" size="sm" variant="ghost" onClick={() => act.mselClear(which)} />
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

interface PivotRow {품번: string; 품명: string; brand: string; 거래처: string | null; quarters: Map<string, number>; total: number; available: number}

function CustomerTable() {
  const m = customerTableModel();
  if (m.rows.length === 0) return <EmptyState isCompact title="데이터가 없습니다." />;
  const shown: PivotRow[] = m.rows.slice(0, ui.customerPage);
  // 거래처 2개 이상: 같은 품번 행을 묶어서 품번 · 브랜드 · 품명 · 가용재고를 한 번만 (rowSpan)
  const groupSize = (k: number) => { let j = k; while (j < shown.length && shown[j].품번 === shown[k].품번) j++; return j - k; };
  let groupIdx = -1;
  return (
    <VStack gap={2}>
      {/* 좁은 화면에서는 칸을 찌그러뜨리지 않고 옆으로 스크롤 */}
      <Table density="compact" dividers="rows" hasHover style={{minWidth: 640 + (m.groupByCust ? 110 : 0) + m.quarterCols.length * 84}}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>품번</TableHeaderCell>
            <TableHeaderCell>브랜드</TableHeaderCell>
            <TableHeaderCell>품명</TableHeaderCell>
            {/* 운영 화면은 여기서 머리글이 '거래처 · 가용재고' 순서였지만 실제 칸은 '가용재고 · 거래처' 순서여서 머리글을 칸에 맞춤 */}
            <TableHeaderCell className="num">가용재고</TableHeaderCell>
            {m.groupByCust && <TableHeaderCell>거래처</TableHeaderCell>}
            {m.quarterCols.map((q: string) => <TableHeaderCell key={q} className="num">{shortQuarter(q)}</TableHeaderCell>)}
            <TableHeaderCell className="num">합계</TableHeaderCell>
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
                    <TableCell rowSpan={span}><code>{r.품번}</code></TableCell>
                    <TableCell rowSpan={span}><BrandBadge brand={r.brand} /></TableCell>
                    <TableCell rowSpan={span}>{r.품명}</TableCell>
                  </>
                )}
                {m.groupByCust && first && <TableCell rowSpan={span} className="num strong">{fmt(r.available)}</TableCell>}
                {m.groupByCust && <TableCell><Text type="supporting">{r.거래처}</Text></TableCell>}
                {!m.groupByCust && <TableCell className="num strong">{fmt(r.available)}</TableCell>}
                {m.quarterCols.map((q: string) => {
                  const v = r.quarters.get(q);
                  return <TableCell key={q} className={v ? 'num' : 'num muted'}>{v ? fmt(v) : '-'}</TableCell>;
                })}
                <TableCell className="num strong">{fmt(r.total)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
      <Text type="supporting">
        품번(SKU)이나 품명을 검색해서 선택하면, 그 품목(들)을 거래처별·월별로 얼마나 팔았는지 표로 보여줍니다. 여러 품번을 줄바꿈이나 쉼표로 구분해서 붙여넣고{' '}
        <Text type="supporting" weight="bold">Enter</Text>를 누르면 검색된 품번이 모두 합산되어 바로 선택됩니다. (여러 줄을 입력만 하고 싶을 땐 Shift+Enter)
      </Text>
      <div
        className="sku-search"
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
        <TextArea
          label="품번 또는 품명 검색"
          isLabelHidden
          rows={2}
          placeholder="품번 또는 품명 검색 (여러 개는 줄바꿈/쉼표로 구분)"
          value={ui.skuStatusSearch}
          onChange={v => { act.setSkuSearch(v); setOpen(true); }}
        />
        {open && matches && (
          <Card padding={2}>
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
  if (ui.skuStatusSelected.size === 0) {
    return <EmptyState isCompact title="품번(품명)을 검색해서 하나 이상 선택해주세요." description="여러 개 선택하면 합산해서 보여줍니다." />;
  }
  const names = new Map(productList().map((p: {pn: string; name: string}) => [p.pn, p.name]));
  const s = skuStatusModel();
  return (
    <VStack gap={3}>
      <HStack gap={1} wrap="wrap" vAlign="center">
        {[...ui.skuStatusSelected].map((pn: string) => (
          <Token key={pn} size="sm" label={`${pn} · ${names.get(pn) || ''}`} onRemove={() => act.removeSku(pn)} />
        ))}
        <Button label="전체 지우기" size="sm" variant="ghost" onClick={act.clearSku} />
      </HStack>
      {ui.skuStatusSelected.size > 1 && <Text type="supporting">선택한 {fmt(ui.skuStatusSelected.size)}개 품번을 합산한 수량입니다.</Text>}
      {s.custList.length === 0 ? (
        <EmptyState isCompact title="선택한 품번의 판매 이력이 없습니다." />
      ) : (
        <>
          <HStack>
            <Button label="엑셀 다운로드" variant="primary" size="sm" icon={<Icon icon="arrowDown" />} onClick={() => saveCsv(skuStatusCsv())} />
          </HStack>
          <Table density="compact" dividers="rows" hasHover style={{minWidth: 220 + s.months.length * 76}}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>거래처</TableHeaderCell>
                {s.months.map((mk: string) => <TableHeaderCell key={mk} className="num">{skuMonthLabel(mk, s.singleYear)}</TableHeaderCell>)}
                <TableHeaderCell className="num">합계</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.rows.map((r: {cust: string; values: number[]; total: number}) => (
                <TableRow key={r.cust}>
                  <TableCell>{r.cust}</TableCell>
                  {r.values.map((v, i) => <TableCell key={i} className="num">{fmt(v)}</TableCell>)}
                  <TableCell className="num strong">{fmt(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="strong">합계</TableCell>
                {s.monthTotals.map((v: number, i: number) => <TableCell key={i} className="num strong">{fmt(v)}</TableCell>)}
                <TableCell className="num strong">{fmt(s.grandTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </>
      )}
    </VStack>
  );
}
