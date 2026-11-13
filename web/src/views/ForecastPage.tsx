import {useState, type KeyboardEvent, type ReactNode} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {Cog6ToothIcon, StarIcon} from '@heroicons/react/16/solid';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {useStore} from '../app/useStore';
import {ErrorBoundary} from '../app/ErrorBoundary';
import {state, ui} from '../lib/store.js';
import {getRules, groupOf, STATUS_LABEL, teamLabel, forecastListCsv} from '../lib/forecast.js';
import {coverageBands, customerShortRows, forecastModel, forecastDetail, rulesModel, warehouseRows} from '../lib/views.js';
import * as act from '../lib/actions.js';
import {canEditSettings, saveRules, resetRules, addHero, deleteHero} from '../data/settings.js';
import {fmt} from '../lib/format';
import {ProductLink} from './ProductLink';
import {addManyToCart, addToCart, applyView, deleteView, saveView, savedViews} from '../lib/insights.js';
import {saveCsv} from '../lib/saveCsv';

const ALL = '__all__'; // 토글 그룹은 빈 값을 '선택 없음'으로 다뤄서 '전체'(빈 값)를 대신 표시
const toUi = (v: string | null | string[]) => (v === ALL ? '' : (v as string));

export function ForecastPage() {
  useStore();
  return (
    <PageFrame view="forecast">
      <VStack gap={4}>
        <HeroAlert />
        {state.loaded ? <Forecast /> : <NoData />}
      </VStack>
    </PageFrame>
  );
}

let subview: 'item' | 'customer' = 'item'; // 판매 현황과 같은 방식: 다른 화면에 다녀와도 마지막 보기 유지

function Forecast() {
  const ver = String(useStore()); // 데이터가 다시 들어오면 부분 오류 상태를 풀고 다시 그림
  const [, rerender] = useState(0);
  const m = forecastModel();
  const shown = m.list.slice(0, ui.forecastPage);
  return (
    <VStack gap={4}>
      <ErrorBoundary resetKey={ver} title="기준 설정을 표시하지 못했습니다."><RulesEditor /></ErrorBoundary>
      <TabList role="tablist" size="sm" hasDivider value={subview} onChange={v => { subview = v as typeof subview; rerender(n => n + 1); }}>
        <Tab value="item" label="품목별" panelId="forecast-panel" />
        <Tab value="customer" label="거래처별" panelId="forecast-panel" />
      </TabList>
      <div id="forecast-panel" role="tabpanel" aria-label={subview === 'item' ? '품목별' : '거래처별'}>
        {subview === 'customer' ? <ErrorBoundary resetKey={ver} title="거래처별 보기를 표시하지 못했습니다."><CustomerView go={() => { subview = 'item'; rerender(n => n + 1); }} /></ErrorBoundary> : (
          <VStack gap={3}>
            <Filters m={m} />
            <ErrorBoundary resetKey={ver} title="저장된 보기를 표시하지 못했습니다."><SavedViews /></ErrorBoundary>
            {m.isOverstock && <OverstockScope />}
            <SummaryBar m={m} />
            {m.list.length === 0 ? (
              <EmptyState isCompact title="조건에 맞는 품목이 없습니다." />
            ) : (
              <>
                <Collapsible defaultIsOpen={false} trigger={<Text type="supporting" weight="medium">부족 수량 계산 방법</Text>}>
                  <Text type="supporting">
                    <Text type="supporting" weight="bold">부족 수량 = 목표 재고 − 가용재고 − 입고예정</Text> (0 미만이면 0). 목표 재고는 최근 12개월(이번 달 제외) 중 <Text type="supporting" weight="bold">모든 거래처 합계 월 판매량이 가장 많았던 달</Text>의 판매량입니다.
                    가용재고는 {teamLabel()} 정상창고 기준이며 품목마다 한 번만 셉니다. 입고예정은 날짜가 지나지 않은 것만 더합니다. 반품 · 마이너스 조정은 판매와 따로 보며 목표에 넣지 않습니다.
                    상태는 (가용재고 + 입고예정) ÷ 목표 재고로 정합니다: 부족 수량이 없으면 여유, 목표의 {getRules().riskPct}% 미만은 생산 필요, 그 사이는 생산 추천, 최근 12개월 판매가 없으면 참고.
                    가장 많이 팔린 달이 그다음 달의 2배 이상이면 일회성 대량 판매일 수 있어 '대량 판매 확인'으로 표시합니다 (목표에서 빼지는 않습니다). 행 앞의 화살표로 근거를 볼 수 있습니다.
                  </Text>
                </Collapsible>
                <ForecastTable m={m} shown={shown} />
                <Text type="supporting" className="scroll-hint">표는 옆으로 밀어서 볼 수 있습니다 (품번 열은 고정).</Text>
                {m.list.length > shown.length && (
                  <HStack hAlign="center">
                    <Button label={`더 보기 (${fmt(m.list.length - shown.length)}개 더)`} variant="secondary" onClick={act.forecastMore} />
                  </HStack>
                )}
              </>
            )}
          </VStack>
        )}
      </div>
    </VStack>
  );
}

type Model = ReturnType<typeof forecastModel>;

/* ---------------- 필터: 상태 · 거래처 · 검색 · 품번 칩 · 판매 없는 품목 (팀 · 브랜드는 화면 위 공통 필터) ---------------- */
function Filters({m}: {m: Model}) {
  const [pnText, setPnText] = useState('');
  const onPnKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); act.forecastPnEnter(pnText); setPnText(''); }
  };
  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={4} wrap="wrap" vAlign="center">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="label" color="secondary">상태</Text>
            <ToggleButtonGroup label="상태" size="sm" value={ui.forecastGrade || ALL} onChange={v => v !== null && act.setForecastGrade(toUi(v))}>
              {m.gradeChips.map(([v, l, n]) => <ToggleButton key={v || ALL} value={v || ALL} label={`${l} ${fmt(n)}`} />)}
              <ToggleButton value="과잉재고" label="과잉재고" />
            </ToggleButtonGroup>
          </HStack>
        </HStack>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <div className="grow-field">
            <Selector
              label="거래처"
              isLabelHidden
              size="sm"
              value={ui.forecastCustomer || ALL}
              options={[{value: ALL, label: '거래처 전체'}, ...state.customers.map((c: string) => ({value: c, label: c}))]}
              onChange={v => act.setForecastCustomer(toUi(v))}
            />
          </div>
          <div className="grow-field">
            <TextInput label="품번 / 품명 검색" isLabelHidden size="sm" placeholder="품번 / 품명 검색" value={ui.forecastSearch} onChange={act.setForecastSearch} />
          </div>
          <div className="grow-field">
            <TextInput label="품번 칩 추가" isLabelHidden size="sm" placeholder="품번 입력 후 Enter (여러 개 가능)" value={pnText} onChange={setPnText} onKeyDown={onPnKey} />
          </div>
          <CheckboxInput size="sm" label="최근 6개월 판매 이력 없는 품목도 보기" value={ui.forecastShowNoSales} onChange={act.setForecastShowNoSales} />
        </HStack>
        {ui.forecastPnChips.size > 0 && (
          <HStack gap={1} wrap="wrap" vAlign="center">
            {[...ui.forecastPnChips].map((pn: string) => <Token key={pn} size="sm" label={pn} onRemove={() => act.removeForecastPnChip(pn)} />)}
            <Button label="전체 지우기" size="sm" variant="ghost" onClick={act.clearForecastPnChips} />
          </HStack>
        )}
      </VStack>
    </Card>
  );
}

/** 과잉재고 기준 창고 (기존 renderForecastOverstockScope) */
function OverstockScope() {
  return (
    <Card variant="muted">
      <VStack gap={2}>
        <RadioList label="과잉재고 기준 창고" orientation="horizontal" size="sm" value={ui.forecastOverstockScope} onChange={act.setOverstockScope}>
          <RadioListItem value="all" label={`전체 (${teamLabel()})`} />
          <RadioListItem value="b2b1" label={`${ui.team === '전체' ? 'B2B1·B2B2팀' : ui.team} 창고만`} />
          <RadioListItem value="emp" label="EMP 정상창고만" />
        </RadioList>
        <Text type="supporting">최근 6개월간 판매 이력이 없으면서 재고가 남아있는 품목입니다</Text>
      </VStack>
    </Card>
  );
}

/** 생산 필요 요약 + 표 내려받기 */
function SummaryBar({m}: {m: Model}) {
  return (
    <Card>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        {/* 문장은 보통 굵기, 품목 수 · 총 수량만 굵은 색 글자로 */}
        <Text type="label" className="summary-line">
          {ui.forecastCustomer && <Text type="supporting">{ui.forecastCustomer} 기준 · </Text>}
          {m.needItems > 0 ? (
            <>지금 생산 필요 <b className="text-danger">{fmt(m.needItems)}개 품목</b> <Text type="supporting">/ 총</Text> <b className="text-danger">{fmt(m.needQty)}개</b></>
          ) : (
            <b className="text-safe">지금 발주할 품목 없음</b>
          )}
        </Text>
        <HStack gap={2} wrap="wrap">
          <Button label={`생산 필요 ${fmt(m.needItems)}개 목록에 담기`} size="sm" variant="secondary" isDisabled={m.needItems === 0}
            onClick={() => addManyToCart(m.list.filter((x: FRow) => x.orderQty > 0 && !['휴면', '단발성', '데이터부족'].includes(x.grade)).map((x: FRow) => x.품번))} />
          <Button label="표 내려받기(CSV)" size="sm" variant="secondary" icon={<Icon icon="arrowDown" />} onClick={() => saveCsv(forecastListCsv())} />
        </HStack>
      </HStack>
    </Card>
  );
}

/** 상태 배지: 화면에는 4단계(위험·주의·여유·참고), 세부 등급은 툴팁 */
// 옅은 배경 + 진한 글자 (Astryx 의 error / warning / success 는 꽉 찬 색이라 표 안에서 너무 튐)
const GRADE_VARIANT = {위험: 'red', 주의: 'yellow', 여유: 'green', 참고: 'neutral'} as const; // 키는 내부 등급, 화면에는 STATUS_LABEL
export function GradeBadge({grade}: {grade: string}) {
  const g = groupOf(grade) as keyof typeof GRADE_VARIANT;
  return (
    <span title={`세부 등급: ${grade}`}>
      <Badge variant={GRADE_VARIANT[g]} label={STATUS_LABEL[g]} />
    </span>
  );
}

interface Spike {month: {y: number; m: number}; qty: number; second: number; customers: {cust: string; qty: number}[]; oneMonth: boolean}
interface FRow {discontinued: boolean; 품번: string; 품명: string; brand: string; grade: string; hero: boolean; orderQty: number; target: number; available: number; incoming: number; incomingExcluded: number; returns: number; spike: Spike | null; ratio: number | null}

// 열 너비(px): 고정 레이아웃이라 긴 품명이 다른 칸을 밀어내지 않음. 합계가 표의 최소 너비 (좁으면 옆으로 스크롤)
const W = {pn: 250, grade: 112, avail: 92, short: 108, month: 62};
const tableMin = (months: number) => W.pn + W.grade + W.avail + W.short + W.month * months;

function ForecastTable({m, shown}: {m: Model; shown: FRow[]}) {
  const cols = 4 + m.months.length;
  return (
    <Card padding={0}>
      <Table className="sticky-first wrap-head fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: tableMin(m.months.length)}}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell className="sticky-col" style={{width: W.pn}}>품번 / 품명</TableHeaderCell>
            <TableHeaderCell style={{width: W.grade}}>상태</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.avail}}>가용재고</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.short}}>부족 수량</TableHeaderCell>
            {m.months.map((mm: {y: number; m: number}) => <TableHeaderCell key={mm.y + '-' + mm.m} className="num dense" style={{width: W.month}}>{mm.m + 1}월</TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(x => {
            const open = ui.forecastExpanded.has(x.품번);
            return [
              <TableRow key={x.품번}>
                <TableCell className="sticky-col">
                  <HStack gap={1} vAlign="center">
                    <IconButton label={open ? '근거 닫기' : '근거 보기'} size="sm" variant="ghost" icon={<Icon icon={open ? 'chevronDown' : 'chevronRight'} />} onClick={() => act.toggleForecastDetail(x.품번)} />
                    <VStack gap={0}>
                      <HStack gap={1} vAlign="center">
                        <ProductLink pn={x.품번} className="nowrap" />
                        {x.hero && <span className="hero-mark" title="히어로 품목: 수량 기준으로 판정" role="img" aria-label="히어로 품목"><StarIcon width={14} height={14} aria-hidden /></span>}
                      </HStack>
                      <span className="pn-name">{x.품명}</span>
                    </VStack>
                  </HStack>
                </TableCell>
                <TableCell>
                  <VStack gap={0.5} hAlign="start">
                    <GradeBadge grade={x.grade} />
                    {x.spike && <Badge variant="yellow" label={x.spike.oneMonth ? '판매 한 달뿐' : '대량 판매 확인'} />}
                  </VStack>
                </TableCell>
                <TableCell className="num">{fmt(x.available)}</TableCell>
                <TableCell className={x.orderQty > 0 ? 'num short-qty' : 'num muted'}>{x.orderQty > 0 ? fmt(x.orderQty) : '-'}</TableCell>
                {m.monthly(x).map((v: number, i: number) => <TableCell key={i} className="num muted dense">{v ? fmt(v) : '-'}</TableCell>)}
              </TableRow>,
              open && (
                <TableRow key={x.품번 + '-detail'}>
                  <TableCell colSpan={cols}><div className="detail-sticky"><ErrorBoundary resetKey={x.품번} title="이 품목의 근거를 표시하지 못했습니다."><Detail x={x} /></ErrorBoundary></div></TableCell>
                </TableRow>
              ),
            ];
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

const ym = (d: {y: number; m: number}) => `${String(d.y).slice(2)}.${d.m + 1}`;

/** 펼친 행: 부족 수량 근거 · 대량 판매 확인 · 거래처별 월 판매 · 창고별 재고 · 입고예정 · 최근 판매 */
function Detail({x}: {x: FRow}) {
  const d = forecastDetail(x);
  const wh = warehouseRows(x.품번);
  const ml = state.scheduleMonthLabels;
  const sp = x.spike;
  return (
    <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap"><BrandBadge brand={x.brand} /><Button label="발주 목록에 담기" size="sm" variant="secondary" isDisabled={x.orderQty <= 0} onClick={() => addToCart(x.품번)} /></HStack>
        <Heading level={4}>부족 수량 근거</Heading>
        <MiniTable num={[1]} head={['항목', '수량']} rows={[
          ['목표 재고 (최근 12개월 월 최대 판매)', fmt(x.target)],
          ['− 가용재고', fmt(x.available)],
          ['− 입고예정 (유효)', fmt(x.incoming)],
          [<strong>부족 수량</strong>, <strong>{fmt(x.orderQty)}</strong>],
        ]} />
        {x.discontinued && <Text type="supporting">제품일정표에서 단종 품목이라 발주 대상(부족 수량)에서 제외했습니다.</Text>}
        {x.incomingExcluded > 0 && <Text type="supporting">날짜가 지난 입고예정 {fmt(x.incomingExcluded)}개는 이미 입고됐거나 불확실해서 뺐습니다.</Text>}
        {x.returns > 0 && <Text type="supporting">반품 · 마이너스 조정 {fmt(x.returns)}개는 판매와 따로 보며 목표에 넣지 않았습니다.</Text>}
        {sp && (
          <Text type="supporting"><span className="text-warn">대량 판매 확인:</span> 목표가 된 {sp.month.y}년 {sp.month.m + 1}월 판매 {fmt(sp.qty)}개가 그다음 많은 달({fmt(sp.second)}개)의 {sp.second > 0 ? `${(sp.qty / sp.second).toFixed(1)}배` : '무한대(다른 달 판매 없음)'}입니다
            {sp.customers.length > 0 && <> · 주요 거래처 {sp.customers.map(c => `${c.cust} ${fmt(c.qty)}`).join(', ')}</>}. 일회성 주문이면 목표가 과대할 수 있으니 확인해 주세요 (계산에는 그대로 포함).</Text>
        )}
      </VStack>
      <VStack gap={2} className="detail-wide">
        <Heading level={4}>월별 판매 (최근 12개월, 이번 달 제외)</Heading>
        {d.customers.length === 0 ? (
          <Text type="supporting">최근 12개월간 판매 이력이 없습니다.</Text>
        ) : (
          <>
            <MiniTable
              num={d.months.map((_: unknown, i: number) => i + 1).concat([d.months.length + 1])}
              head={['거래처', ...d.months.map(ym), '합계']}
              rows={[
                ...d.customers.map((c: {거래처: string; months: number[]; total: number}) => [
                  <>{c.거래처}{ui.forecastCustomer && c.거래처 === ui.forecastCustomer && <> <Badge variant="green" label="선택됨" /></>}</>,
                  ...c.months.map(v => (v ? fmt(v) : '-')), fmt(c.total)]),
                [<strong>전체 합계</strong>, ...d.monthTotals.map((v: number) => <strong>{v ? fmt(v) : '-'}</strong>), <strong>{fmt(d.monthTotals.reduce((a: number, b: number) => a + b, 0))}</strong>],
              ]}
            />
            <Text type="supporting">거래일자별 상세 (최근 6개월 · 최근 20건)</Text>
            <MiniTable num={[2]} head={['실적일자', '거래처', '수량']} rows={d.details.map((s: {실적일자: Date; 거래처: string; 수량: number}) => [s.실적일자.toLocaleDateString('ko-KR'), s.거래처, fmt(s.수량)])} />
          </>
        )}
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>창고별 가용재고 (전체 창고)</Heading>
        <MiniTable
          num={[1]}
          head={['창고', '가용재고']}
          rows={[
            ...wh.rows.map((r: {창고: string; 가용재고: number; picked: boolean}) => [<>{r.창고}{r.picked && <> <Badge variant="green" label="추가됨" /></>}</>, fmt(r.가용재고)]),
            ...(wh.total !== null ? [[<strong>합계</strong>, <strong>{fmt(wh.total)}</strong>]] : []),
          ]}
        />
        <Text type="supporting">위 표는 전체 창고 기준이며, 표의 "가용재고" 숫자는 {teamLabel()} 정상창고만 합산한 값입니다.</Text>
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>입고예정 상세 ({ml[0]}~{ml[2]})</Heading>
        {d.incomingRows.length === 0 ? (
          <Text type="supporting">예정된 입고가 없습니다.</Text>
        ) : (
          <MiniTable num={[2]} head={['월', '날짜', '수량']} rows={d.incomingRows.map((r: {m: string; d: string; q: number}) => [r.m, r.d || '날짜 미정', fmt(r.q)])} />
        )}
      </VStack>
    </Grid>
  );
}

/* ---------------- 거래처별: 거래처가 산 품목 중 부족한 품목 (부족 수량은 품목 기준이라 거래처끼리 더하지 않음) ---------------- */
function CustomerView({go}: {go: () => void}) {
  const rows: {cust: string; items: number; short: number; last: Date | null}[] = customerShortRows();
  if (rows.length === 0) return <EmptyState isCompact title="최근 12개월 판매한 거래처가 없습니다." />;
  return (
    <VStack gap={3}>
      <Card padding={0}>
        <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 620}}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className="sticky-col" style={{width: 240}}>거래처</TableHeaderCell>
              <TableHeaderCell className="num" style={{width: 110}}>구매 품목</TableHeaderCell>
              <TableHeaderCell className="num" style={{width: 130}}>부족 품목</TableHeaderCell>
              <TableHeaderCell style={{width: 110}}>마지막 주문</TableHeaderCell>
              <TableHeaderCell style={{width: 110}} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.cust}>
                <TableCell className="sticky-col">{r.cust}</TableCell>
                <TableCell className="num">{fmt(r.items)}</TableCell>
                <TableCell className={r.short > 0 ? 'num short-qty' : 'num muted'}>{r.short > 0 ? fmt(r.short) : '-'}</TableCell>
                <TableCell>{r.last ? r.last.toLocaleDateString('ko-KR') : '-'}</TableCell>
                <TableCell><Button label="품목 보기" size="sm" variant="ghost" onClick={() => { act.setForecastCustomer(r.cust); go(); }} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Text type="supporting">부족 품목은 그 거래처가 최근 12개월 안에 산 품목 중 부족 수량이 있는 품목 수입니다. 재고는 모든 거래처가 함께 쓰므로 부족 수량은 거래처별로 나누거나 더하지 않고, '품목 보기'에서 품목 기준으로 확인합니다.</Text>
    </VStack>
  );
}

/** 상세 안의 작은 표. num = 숫자 칸(오른쪽 정렬) 열 번호. 칸 안에서 글자가 꺾이지 않고, 좁으면 표 안에서 옆으로 스크롤 */
function MiniTable({head, rows, num}: {head: string[]; rows: ReactNode[][]; num: number[]}) {
  const cls = (i: number) => (num.includes(i) ? 'num' : undefined);
  return (
    <Card padding={0}>
    <Table className="mini-table" density="compact" dividers="rows">
      <TableHeader>
        <TableRow>{head.map((h, i) => <TableHeaderCell key={h || i} className={cls(i)}>{h}</TableHeaderCell>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, k) => <TableRow key={k}>{r.map((c, i) => <TableCell key={i} className={cls(i)}>{c}</TableCell>)}</TableRow>)}
      </TableBody>
    </Table>
    </Card>
  );
}

/* ---------------- 기준 설정 (고급) · 히어로 품목 (기존 renderForecastRules) ---------------- */
const RULE_LABEL: Record<string, string> = {riskPct: '생산 필요 기준(%)'};
function RulesEditor() {
  const {R, heroRows, alertN} = rulesModel();
  const cb = coverageBands();
  const edit = canEditSettings();
  const [form, setForm] = useState<Record<string, number | null>>({...R});
  const [msg, setMsg] = useState<{text: string; tone: 'danger' | 'muted' | 'safe'} | null>(null);
  const [hero, setHero] = useState<{pn: string; min: number | null; warn: number | null}>({pn: '', min: null, warn: null});
  const [heroMsg, setHeroMsg] = useState('');
  const num = (k: string, w = 72) => (
    <span className="inline-num" style={{width: w}}>
      <NumberInput label={RULE_LABEL[k]} isLabelHidden size="sm" min={0} isDisabled={!edit} value={form[k]} onChange={v => setForm(f => ({...f, [k]: v}))} />
    </span>
  );
  const save = async () => {
    const r = await saveRules(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === null ? '' : String(v)])));
    setMsg(r.error ? {text: r.error, tone: 'danger'} : {text: r.ok || '', tone: 'safe'});
  };
  const reset = async () => { await resetRules(); setForm({...rulesModel().R}); setMsg(null); };
  const add = async () => {
    const r = await addHero(hero.pn, hero.min === null ? '' : String(hero.min), hero.warn === null ? '' : String(hero.warn));
    setHeroMsg(r.error || '');
    if (!r.error) setHero({pn: '', min: null, warn: null});
  };
  const trigger = (
    <HStack gap={2} vAlign="center">
      <Cog6ToothIcon width={16} height={16} aria-hidden className="muted" />
      <Text type="label">기준 설정 (고급) · 히어로 품목</Text>
      {alertN > 0 && <Badge variant="red" label={`알람 ${alertN}개`} />}
    </HStack>
  );
  return (
    <Card>
      <Collapsible trigger={trigger} isOpen={!!ui.rulesOpen} onOpenChange={o => { act.setRulesOpen(o); setForm({...rulesModel().R}); setMsg(null); }}>
        <VStack gap={2} paddingBlockStart={3}>
          <Text type="body"><Badge variant="red" label="생산 필요" /> (가용재고 + 입고예정)이 목표 재고의 {num('riskPct', 64)}% 미만 · <Badge variant="yellow" label="생산 추천" /> {R.riskPct}% 이상 ~ 100% 미만 · <Badge variant="green" label="여유" /> 100% 이상 (부족 수량 없음) · <Badge variant="neutral" label="참고" /> 최근 12개월 판매 없음</Text>
          <Text type="supporting">현재 품목 분포 (비율 = (가용재고 + 입고예정) ÷ 목표 재고): {(cb.bands as {label: string; n: number}[]).map(b => `${b.label} ${fmt(b.n)}개`).join(' · ')} · 판매 없음 ${fmt(cb.ref)}개. 생산 필요 기준은 이 분포를 보고 정하세요.</Text>
          {edit ? (
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button label="기준 저장" size="sm" variant="primary" onClick={save} />
              <Button label="기본값으로" size="sm" variant="secondary" onClick={reset} />
              {msg && <Text type="supporting"><span className={'text-' + msg.tone} role="status">{msg.text}</span></Text>}
            </HStack>
          ) : (
            <Text type="supporting">기준 변경은 업데이트 권한자만 할 수 있습니다.</Text>
          )}
          <hr className="rule" />
          <Text type="body" weight="bold"><StarIcon width={14} height={14} aria-hidden className="hero-mark" /> 히어로 품목 생산 필요 기준 <Text type="supporting">— 대량 출고가 많은 품목은 일수 대신 <strong>수량</strong>으로 판정합니다 (예: 가용재고 30,000개 이하면 위험 + 알람)</Text></Text>
          <Text type="supporting">가용재고는 위쪽에서 선택한 팀({ui.team}) 창고 기준입니다. 생산 필요 수량 이하 → 생산 필요(알람), 생산 추천 수량 이하 → 생산 추천, 그 외 여유.</Text>
          {edit && (
            <HStack gap={2} vAlign="end" wrap="wrap">
              <TextInput label="히어로 품번" size="sm" placeholder="품번 (예: SB1344)" value={hero.pn} onChange={v => setHero(h => ({...h, pn: v}))} />
              <NumberInput label="생산 필요 수량(이하)" size="sm" min={1} value={hero.min} onChange={v => setHero(h => ({...h, min: v}))} />
              <NumberInput label="생산 추천 수량(선택)" size="sm" min={1} value={hero.warn} onChange={v => setHero(h => ({...h, warn: v}))} />
              <Button label="추가/수정" size="sm" variant="primary" onClick={add} />
              {heroMsg && <Text type="supporting"><span className="text-danger" role="alert">{heroMsg}</span></Text>}
            </HStack>
          )}
          {heroRows.length === 0 ? (
            <Text type="supporting">등록된 히어로 품목이 없습니다.</Text>
          ) : (
            <MiniTable
              num={[2, 3, 4]}
              head={['품번', '품명', '현재 가용재고', '생산 필요 수량(이하)', '생산 추천 수량(이하)', '상태', '']}
              rows={heroRows.map((h: {pn: string; h: {minQty: number; warnQty: number}; x?: {품명: string; available: number; grade: string}}) => [
                <code>{h.pn}</code>, h.x ? h.x.품명 : '-', h.x ? fmt(h.x.available) : '-', fmt(h.h.minQty), h.h.warnQty > 0 ? fmt(h.h.warnQty) : '-',
                h.x ? <GradeBadge grade={h.x.grade} /> : <Text type="supporting">데이터에 없음</Text>,
                edit ? <Button label="삭제" size="sm" variant="ghost" onClick={() => deleteHero(h.pn)} /> : null,
              ])}
            />
          )}
        </VStack>
      </Collapsible>
    </Card>
  );
}

/** 저장된 보기: 지금 필터(상태 · 구분 · 거래처 · 검색)를 이름으로 저장해 두고 한 번에 불러옴. 이 브라우저에만 저장 */
function SavedViews() {
  const [name, setName] = useState('');
  const views: {name: string}[] = savedViews();
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text type="supporting">저장된 보기</Text>
      {views.map(v => (
        <HStack key={v.name} gap={0.5} vAlign="center">
          <Button label={v.name} size="sm" variant="secondary" onClick={() => applyView(v.name)} />
          <IconButton label={`${v.name} 삭제`} size="sm" variant="ghost" icon={<Icon icon="close" />} onClick={() => deleteView(v.name)} />
        </HStack>
      ))}
      <span style={{width: 170}}><TextInput label="보기 이름" isLabelHidden size="sm" placeholder="현재 필터 저장…" value={name} onChange={setName} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' && name.trim()) { saveView(name); setName(''); } }} /></span>
      <Button label="저장" size="sm" variant="ghost" isDisabled={!name.trim()} onClick={() => { saveView(name); setName(''); }} />
    </HStack>
  );
}
