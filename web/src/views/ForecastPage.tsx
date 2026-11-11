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
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {useStore} from '../app/useStore';
import {state, ui} from '../lib/store.js';
import {groupOf, teamLabel, forecastListCsv} from '../lib/forecast.js';
import {forecastModel, forecastDetail, forecastNextText, patternNextText, rulesModel, warehouseRows} from '../lib/views.js';
import * as act from '../lib/actions.js';
import {canEditSettings, saveRules, resetRules, addHero, deleteHero} from '../data/settings.js';
import {fmt} from '../lib/format';
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

function Forecast() {
  const m = forecastModel();
  const shown = m.list.slice(0, ui.forecastPage);
  return (
    <VStack gap={4}>
      <RulesEditor />
      <Filters m={m} />
      {m.isOverstock && <OverstockScope />}
      <SummaryBar m={m} />
      {m.list.length === 0 ? (
        <EmptyState isCompact title="조건에 맞는 품목이 없습니다." />
      ) : (
        <>
          <Text type="supporting">
            <Text type="supporting" weight="bold">발주할 수량 = ① 3개월 예상수요 − ② 가용재고 − ③ 입고예정</Text> (<Text type="supporting" weight="bold">{teamLabel()}</Text> 정상창고 기준). ①은 거래처별로{' '}
            <Text type="supporting" weight="bold">마지막 주문일 + 평균 주문주기</Text>를 계산해 3개월 안에 들어올 주문만 더한 값이라, 한 번에 많이 가져가고 쉬는 거래처도 반영됩니다. 아래 작은 글씨는 가장 가까운 예상 주문입니다. 행의 ▸ 를 누르면 거래처별 근거가 열립니다.
          </Text>
          <ForecastTable m={m} shown={shown} />
          {m.list.length > shown.length && (
            <HStack hAlign="center">
              <Button label={`더 보기 (${fmt(m.list.length - shown.length)}개 더)`} variant="secondary" onClick={act.forecastMore} />
            </HStack>
          )}
        </>
      )}
    </VStack>
  );
}

type Model = ReturnType<typeof forecastModel>;

/* ---------------- 필터: 상태 · 브랜드 · 거래처 · 검색 · 품번 칩 · 판매 없는 품목 · 거래처별 부족 ---------------- */
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
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="label" color="secondary">브랜드</Text>
            <ToggleButtonGroup label="브랜드" size="sm" value={ui.forecastBrand || ALL} onChange={v => v !== null && act.setForecastBrand(toUi(v))}>
              <ToggleButton value={ALL} label="전체" />
              {m.brands.map((b: string) => <ToggleButton key={b} value={b} label={b} />)}
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
        {(m.topShort.length > 0 || ui.forecastCustomer) && (
          <HStack gap={1} wrap="wrap" vAlign="center">
            <Text type="supporting">거래처별 부족 (눌러서 보기)</Text>
            {m.topShort.map((c: {cust: string; shortItems: number; shortQty: number}) => (
              <ToggleButton
                key={c.cust}
                size="sm"
                label={`${c.cust.length > 22 ? c.cust.slice(0, 21) + '…' : c.cust} ${c.shortItems}개 품목 · ${fmt(c.shortQty)}`}
                isPressed={ui.forecastCustomer === c.cust}
                onPressedChange={() => act.setForecastCustomer(c.cust)}
              />
            ))}
            {ui.forecastCustomer && <Button label="✕ 전체 보기" size="sm" variant="ghost" onClick={() => act.setForecastCustomer('')} />}
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

/** 발주 필요 요약 + 표 내려받기 */
function SummaryBar({m}: {m: Model}) {
  return (
    <Card>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Text type="large" weight="bold">
          {ui.forecastCustomer && <Text type="supporting">{ui.forecastCustomer} 기준 · </Text>}
          {m.needItems > 0 ? (
            <span className="text-danger">지금 발주 필요 {fmt(m.needItems)}개 품목 <Text type="supporting">/ 총</Text> {fmt(m.needQty)}개</span>
          ) : (
            <span className="text-safe">지금 발주할 품목 없음</span>
          )}
        </Text>
        <Button label="표 내려받기(CSV)" size="sm" variant="secondary" icon={<Icon icon="arrowDown" />} onClick={() => saveCsv(forecastListCsv())} />
      </HStack>
    </Card>
  );
}

/** 상태 배지: 화면에는 4단계(위험·주의·여유·참고), 세부 등급은 툴팁 */
const GRADE_VARIANT = {위험: 'error', 주의: 'warning', 여유: 'success', 참고: 'neutral'} as const;
export function GradeBadge({grade}: {grade: string}) {
  const g = groupOf(grade) as keyof typeof GRADE_VARIANT;
  return (
    <span title={`세부 등급: ${grade}`}>
      <Badge variant={grade === '긴급' ? 'red' : GRADE_VARIANT[g]} label={grade === '긴급' ? `${g} (긴급)` : g} />
    </span>
  );
}

interface FRow {품번: string; 품명: string; brand: string; grade: string; hero: boolean; orderQty: number; horizon: number; available: number; incoming: number; avgQuarterly: number}

// 열 너비(px): 고정 레이아웃이라 긴 머리글 · 품명이 다른 칸을 밀어내지 않음. 합계가 표의 최소 너비 (좁으면 옆으로 스크롤)
const W = {pn: 150, brand: 100, name: 160, grade: 84, order: 90, horizon: 130, avail: 90, incoming: 90, avg: 72, month: 56};
const tableMin = (months: number) => W.pn + W.brand + W.name + W.grade + W.order + W.horizon + W.avail + W.incoming + W.avg + W.month * months;

function ForecastTable({m, shown}: {m: Model; shown: FRow[]}) {
  const cols = 9 + m.months.length;
  return (
    <Card padding={0}>
      <Table className="sticky-first wrap-head fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: tableMin(m.months.length)}}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell className="sticky-col" style={{width: W.pn}}>품번</TableHeaderCell>
            <TableHeaderCell style={{width: W.brand}}>구분</TableHeaderCell>
            <TableHeaderCell style={{width: W.name}}>품명</TableHeaderCell>
            <TableHeaderCell style={{width: W.grade}}>상태</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.order}}><span title="① − ② − ③">발주할 수량<br /><Text type="supporting">= ① − ② − ③</Text></span></TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.horizon}}><span title="마지막 주문일 + 평균 주문주기로 다음 주문 시점을 계산해, 3개월 안에 나갈 것으로 예상되는 양">① 3개월<br />예상수요</span></TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.avail}}>② 가용재고</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.incoming}}>③ 입고예정</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: W.avg}}>월평균<br />판매</TableHeaderCell>
            {m.months.map((mm: {y: number; m: number}) => <TableHeaderCell key={mm.y + '-' + mm.m} className="num" style={{width: W.month}}>{mm.m + 1}월<br /><Text type="supporting">판매</Text></TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(x => {
            const open = ui.forecastExpanded.has(x.품번);
            const next = forecastNextText(x);
            return [
              <TableRow key={x.품번}>
                <TableCell className="sticky-col">
                  <HStack gap={1} vAlign="center">
                    <IconButton label={open ? '근거 닫기' : '거래처별 근거 보기'} size="sm" variant="ghost" icon={<Icon icon={open ? 'chevronDown' : 'chevronRight'} />} onClick={() => act.toggleForecastDetail(x.품번)} />
                    <code className="nowrap">{x.품번}</code>
                    {x.hero && <span title="히어로 품목: 수량 기준으로 판정"><Badge variant="yellow" label="★" /></span>}
                  </HStack>
                </TableCell>
                <TableCell><BrandBadge brand={x.brand} /></TableCell>
                <TableCell>{x.품명}</TableCell>
                <TableCell><GradeBadge grade={x.grade} /></TableCell>
                <TableCell className={x.orderQty > 0 ? 'num strong text-danger order-qty' : 'num muted'}>{x.orderQty > 0 ? fmt(x.orderQty) : '-'}</TableCell>
                <TableCell className="num">{fmt(x.horizon)}{next && <div className="next"><Text type="supporting">{next}</Text></div>}</TableCell>
                <TableCell className="num">{fmt(x.available)}</TableCell>
                <TableCell className="num">{x.incoming ? fmt(x.incoming) : '-'}</TableCell>
                <TableCell className="num">{fmt(x.avgQuarterly / 3)}</TableCell>
                {m.monthly(x).map((v: number, i: number) => <TableCell key={i} className="num muted">{v ? fmt(v) : '-'}</TableCell>)}
              </TableRow>,
              open && (
                <TableRow key={x.품번 + '-detail'}>
                  <TableCell colSpan={cols}><div className="detail-sticky"><Detail x={x} /></div></TableCell>
                </TableRow>
              ),
            ];
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/** 펼친 행: 거래처별 발주 패턴 · 최근 판매 · 창고별 가용재고 · 입고예정 (기존 forecastDetailRow) */
function Detail({x}: {x: FRow}) {
  const d = forecastDetail(x);
  const wh = warehouseRows(x.품번);
  const ml = state.scheduleMonthLabels;
  return (
    <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={4}>
      <VStack gap={2}>
        <Heading level={4}>거래처별 발주 패턴 (최근 12개월 · 주기로 다음 주문 예측)</Heading>
        {d.pattern.length === 0 ? (
          <Text type="supporting">최근 12개월간 판매 이력이 없습니다.</Text>
        ) : (
          <>
            <MiniTable
              head={['거래처', '주문횟수', '평균 발주수량', '평균 발주주기', '다음 예상 주문', '분기 환산']}
              rows={d.pattern.map((p: {거래처: string; 주문횟수: number; 평균발주수량: number; 평균발주주기: number | null; 분기환산수량: number; next: {overdue: boolean} | null}) => [
                <>{p.거래처}{ui.forecastCustomer && p.거래처 === ui.forecastCustomer && <> <Badge variant="success" label="선택됨" /></>}</>,
                fmt(p.주문횟수), fmt(Math.round(p.평균발주수량)), p.평균발주주기 ? Math.round(p.평균발주주기) + '일' : '-',
                <span className={p.next && p.next.overdue ? 'text-danger' : undefined}>{patternNextText(p.next)}</span>,
                <strong>{fmt(Math.round(p.분기환산수량))}</strong>,
              ])}
            />
            <Text type="supporting">거래일자별 상세 (최근 20건)</Text>
            <MiniTable head={['실적일자', '거래처', '수량']} rows={d.details.map((s: {실적일자: Date; 거래처: string; 수량: number}) => [s.실적일자.toLocaleDateString('ko-KR'), s.거래처, fmt(s.수량)])} />
          </>
        )}
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>창고별 가용재고 (전체 창고)</Heading>
        <MiniTable
          head={['창고', '가용재고']}
          rows={[
            ...wh.rows.map((r: {창고: string; 가용재고: number; picked: boolean}) => [<>{r.창고}{r.picked && <> <Badge variant="success" label="추가됨" /></>}</>, fmt(r.가용재고)]),
            ...(wh.total !== null ? [[<strong>합계</strong>, <strong>{fmt(wh.total)}</strong>]] : []),
          ]}
        />
        <Text type="supporting">위 표는 전체 창고 기준이며, 상단의 "현재 가용재고" 숫자는 {teamLabel()} 정상창고만 합산한 값입니다.</Text>
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>입고예정 상세 ({ml[0]}~{ml[2]})</Heading>
        {d.incomingRows.length === 0 ? (
          <Text type="supporting">예정된 입고가 없습니다.</Text>
        ) : (
          <MiniTable head={['월', '날짜', '수량']} rows={d.incomingRows.map((r: {m: string; d: string; q: number}) => [r.m, r.d || '날짜 미정', fmt(r.q)])} />
        )}
        <Text type="supporting">예상 분기수요는 거래처별 평균 발주수량 × (91.25일 ÷ 평균 발주주기)의 합입니다.</Text>
      </VStack>
    </Grid>
  );
}

/** 상세 안의 작은 표. 첫 칸 외에는 숫자 칸(오른쪽 정렬) */
function MiniTable({head, rows}: {head: string[]; rows: ReactNode[][]}) {
  return (
    <Card padding={0}>
    <Table className="wrap-head" density="compact" dividers="rows">
      <TableHeader>
        <TableRow>{head.map((h, i) => <TableHeaderCell key={h} className={i > 0 && h !== '거래처' && h !== '날짜' ? 'num' : undefined}>{h}</TableHeaderCell>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, k) => <TableRow key={k}>{r.map((c, i) => <TableCell key={i} className={i > 0 && head[i] !== '거래처' && head[i] !== '날짜' ? 'num' : undefined}>{c}</TableCell>)}</TableRow>)}
      </TableBody>
    </Table>
    </Card>
  );
}

/* ---------------- 기준 설정 (고급) · 히어로 품목 (기존 renderForecastRules) ---------------- */
const RULE_LABEL: Record<string, string> = {leadDays: '리드타임(일)', urgentDays: '긴급 기준(일)', cautionExtra: '주의 추가 일수', safeExtra: '관찰 추가 일수', dormantMonths: '휴면 기준(개월)', minOrders: '최소 주문 횟수'};
function RulesEditor() {
  const {R, T, heroRows, alertN} = rulesModel();
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
      <Text type="label">⚙ 기준 설정 (고급) · 히어로 품목</Text>
      {alertN > 0 && <Badge variant="error" label={`🚨 알람 ${alertN}개`} />}
    </HStack>
  );
  return (
    <Card>
      <Collapsible trigger={trigger} isOpen={!!ui.rulesOpen} onOpenChange={o => { act.setRulesOpen(o); setForm({...rulesModel().R}); setMsg(null); }}>
        <VStack gap={2} paddingBlockStart={3}>
          <Text type="body">생산~입고 <strong>리드타임</strong> {num('leadDays')}일 — 위험하면 이 기간 뒤에 입고된다고 보고 판정합니다.</Text>
          <Text type="supporting">소진예상일 = (현재 가용재고 + 입고예정) ÷ 일평균 수요 &nbsp;(일평균 수요 = 예상 분기수요 ÷ 91일) · 발주여유일 = 소진예상일 − 리드타임</Text>
          <Text type="body"><Badge variant="red" label="긴급" /> 소진예상 <strong>{R.urgentDays}일</strong> 미만 (기준 {num('urgentDays')}일) — 위험해도 입고 전에 결품. 긴급 대응 필요</Text>
          <Text type="body"><Badge variant="error" label="위험" /> 소진예상 <strong>{T.urgent}~{T.risk}일</strong> — 리드타임보다 재고가 적음. <strong>지금 바로 발주</strong>해야 함 (발주 지연)</Text>
          <Text type="body"><Badge variant="warning" label="주의" /> 소진예상 <strong>{T.risk}~{T.caution}일</strong> (리드타임 + {num('cautionExtra', 64)}일) — 한 달 안에 발주</Text>
          <Text type="body"><Badge variant="blue" label="관찰" /> 소진예상 <strong>{T.caution}~{T.watch}일</strong> (리드타임 + {num('safeExtra', 64)}일까지) — 다음 발주 시점 검토</Text>
          <Text type="body"><Badge variant="teal" label="안전(입고예정)" /> 현재고만으론 {T.watch}일 미만이지만 입고예정까지 더하면 충분 · <Badge variant="success" label="안전" /> 현재고만으로 {T.watch}일 이상</Text>
          <Text type="body"><Badge variant="neutral" label="휴면" /> 마지막 출고가 {num('dormantMonths', 60)}개월 이상 전이면 긴급·위험·주의·관찰 대신 <strong>휴면(참고)</strong>으로 분류 (단종·옛 품번 때문에 생기는 혼선 방지, 0이면 사용 안 함)</Text>
          <Text type="body"><Badge variant="neutral" label="단발성" /> 최근 12개월 주문이 {num('minOrders', 60)}회 미만이면 긴급·위험·주의·관찰 대신 <strong>단발성(참고)</strong>으로 분류 (한 번 크게 나간 건 때문에 위험이 과대 표시되는 것을 방지)</Text>
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
          <Text type="body" weight="bold">★ 히어로 품목 위험 기준 <Text type="supporting">— 대량 출고가 많은 품목은 일수 대신 <strong>수량</strong>으로 판정합니다 (예: 가용재고 30,000개 이하면 위험 + 알람)</Text></Text>
          <Text type="supporting">가용재고는 위쪽에서 선택한 팀({ui.team}) 창고 기준입니다. 위험 수량 이하 → 위험(알람), 주의 수량 이하 → 주의, 그 외 안전.</Text>
          {edit && (
            <HStack gap={2} vAlign="end" wrap="wrap">
              <TextInput label="히어로 품번" size="sm" placeholder="품번 (예: SB1344)" value={hero.pn} onChange={v => setHero(h => ({...h, pn: v}))} />
              <NumberInput label="위험 수량(이하)" size="sm" min={1} value={hero.min} onChange={v => setHero(h => ({...h, min: v}))} />
              <NumberInput label="주의 수량(선택)" size="sm" min={1} value={hero.warn} onChange={v => setHero(h => ({...h, warn: v}))} />
              <Button label="추가/수정" size="sm" variant="primary" onClick={add} />
              {heroMsg && <Text type="supporting"><span className="text-danger" role="alert">{heroMsg}</span></Text>}
            </HStack>
          )}
          {heroRows.length === 0 ? (
            <Text type="supporting">등록된 히어로 품목이 없습니다.</Text>
          ) : (
            <MiniTable
              head={['품번', '품명', '현재 가용재고', '위험 수량(이하)', '주의 수량(이하)', '상태', '']}
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
