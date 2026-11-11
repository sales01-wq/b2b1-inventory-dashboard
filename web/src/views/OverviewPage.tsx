import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {GradeBadge} from './ForecastPage';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {getRules, ruleThresholds} from '../lib/forecast.js';
import {forecastNextText, overviewModel, urgentItems} from '../lib/views.js';
import {openForecastSignal} from '../lib/actions.js';
import {fmt} from '../lib/format';

// 신호등 색: 위험 · 주의 · 여유 (Astryx 상태색)
const SIGNAL = {위험: 'error', 주의: 'warning', 여유: 'success'} as const;
type Signal = keyof typeof SIGNAL;
const URGENT_SHOWN = 8;
interface URow {품번: string; 품명: string; brand: string; grade: string; orderQty: number; available: number}

export function OverviewPage() {
  useStore();
  return <PageFrame view="overview">{state.loaded ? <Overview /> : <NoData />}</PageFrame>;
}

/**
 * 구성: 왼쪽(넓게) = 해야 할 일 (히어로 알람 → 발주 필요 목록), 오른쪽(좁게) = 상황 요약 (신호등 · 참고 지표).
 * 좁은 화면에서는 한 줄로: 해야 할 일 → 요약.
 */
function Overview() {
  const m = overviewModel();
  return (
    <div className="ov-grid">
      <div className="ov-main">
        <HeroAlert />
        <UrgentItems nNow={m.nNow} nSoon={m.nSoon} />
      </div>
      <aside className="ov-side" aria-labelledby="ov-signal">
        <SignalLedger m={m} />
      </aside>
    </div>
  );
}

/** 재고 신호등: 신호마다 한 줄 (이름 · 숫자 · 막대 · 뜻). 줄을 누르면 발주 현황을 그 신호로 걸러서 엶 */
function SignalLedger({m}: {m: ReturnType<typeof overviewModel>}) {
  const T = ruleThresholds(getRules());
  const signalTotal = m.nNow + m.nSoon + m.nOk;
  // 각 신호의 뜻: 발주 현황 '기준 설정'의 문구와 같은 기준 (설정을 바꾸면 같이 바뀜)
  const meaning: Record<Signal, string> = {위험: `소진예상 ${T.risk}일 미만`, 주의: `소진예상 ${T.risk}~${T.caution}일`, 여유: `소진예상 ${T.caution}일 이상`};
  return (
    <section className="section">
      <header className="section-head">
        <Heading level={2} id="ov-signal">재고 신호등</Heading>
        <Text type="supporting">품목 {fmt(m.total)}개{m.brands.length > 0 ? ' · ' + m.brands.join(', ') : ''}</Text>
      </header>
      <nav className="ledger" aria-label="신호별 품목">
        {m.circles.map(c => {
          const g = c.label as Signal;
          return (
            <SignalRow key={g} grade={g} dot={SIGNAL[g]} value={c.count} note={meaning[g]}>
              <ProgressBar label={`${g} 비율`} isLabelHidden value={c.pct} variant={SIGNAL[g]} />
              <Text type="supporting">신호 품목 {fmt(signalTotal)}개 중 {c.pct}%</Text>
            </SignalRow>
          );
        })}
        <SignalRow grade="참고" dot="neutral" value={m.nRef} note="휴면 · 단발성 · 데이터 부족 (신호 계산에서 제외)" />
      </nav>
      <Text type="supporting">거래처 {fmt(m.totalCustomers)}곳 · 최근 6개월 총판매 {fmt(m.sold6moTotal)}</Text>
    </section>
  );
}

/** 신호 한 줄: 누르면 발주 현황을 그 상태로 걸러서 엶 (발주 현황 표의 품목 수 = 이 줄의 숫자) */
function SignalRow({grade, value, dot, note, children}: {grade: string; value: number; dot: 'error' | 'warning' | 'success' | 'neutral'; note: string; children?: React.ReactNode}) {
  return (
    <a className="ledger-row" href="#/forecast" onClick={() => openForecastSignal(grade)} aria-label={`${grade} ${fmt(value)}개 — 발주 현황에서 보기`}>
      <span className="ledger-label">
        <StatusDot variant={dot} label={grade} />
        <Text type="label" weight="medium">{grade}</Text>
      </span>
      <span className="ledger-value">{fmt(value)}</span>
      <span className="ledger-chevron" aria-hidden><Icon icon="chevronRight" size="sm" /></span>
      <span className="ledger-detail">
        {children}
        <Text type="supporting">{note}</Text>
      </span>
    </a>
  );
}

/** 발주 필요 (위험+주의): 발주 현황 '발주 필요 (위험+주의)' 칩과 같은 품목 · 같은 정렬. 발주할 수량이 0 인 품목도 있음 (등급 기준이라서) */
function UrgentItems({nNow, nSoon}: {nNow: number; nSoon: number}) {
  const list: URow[] = urgentItems();
  const shown = list.slice(0, URGENT_SHOWN);
  return (
    <section className="section" aria-labelledby="ov-urgent">
      <header className="section-head">
        <Heading level={2} id="ov-urgent">발주 필요 (위험+주의)</Heading>
        {list.length > 0 && (
          <Link href="#/forecast" type="supporting" onClick={() => openForecastSignal('조치필요')}>
            발주 현황에서 전체 보기
          </Link>
        )}
      </header>
      {/* 이 화면에서 가장 중요한 숫자 */}
      <div className="headline">
        <span className="headline-figure">{fmt(list.length)}</span>
        <span className="headline-text">
          <Text type="label" weight="medium">개 품목</Text>
          <Text type="supporting">위험 {fmt(nNow)} · 주의 {fmt(nSoon)} · {list.length > shown.length ? `급한 순 ${shown.length}개 표시` : '급한 순'}</Text>
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyState isCompact headingLevel={3} title="위험 · 주의 품목이 없습니다." description="위험 · 주의 품목이 생기면 여기에 급한 순으로 나옵니다." />
      ) : (
        <Card padding={0} className="flush">
          <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 720}}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className="sticky-col" style={{width: 92}}>품번</TableHeaderCell>
                <TableHeaderCell className="hide-narrow" style={{width: 96}}>브랜드</TableHeaderCell>
                <TableHeaderCell>품명</TableHeaderCell>
                <TableHeaderCell style={{width: 72}}>상태</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 88}}>발주할 수량</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 80}}>가용재고</TableHeaderCell>
                <TableHeaderCell style={{width: 168}}>다음 주문</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(x => (
                <TableRow key={x.품번}>
                  <TableCell className="sticky-col"><code>{x.품번}</code></TableCell>
                  <TableCell className="hide-narrow"><BrandBadge brand={x.brand} /></TableCell>
                  <TableCell>{x.품명}<span className="show-narrow"><BrandBadge brand={x.brand} /></span></TableCell>
                  <TableCell><GradeBadge grade={x.grade} /></TableCell>
                  <TableCell className={x.orderQty > 0 ? 'num strong' : 'num muted'}>{fmt(x.orderQty)}</TableCell>
                  <TableCell className="num">{fmt(x.available)}</TableCell>
                  <TableCell><Text type="supporting">{forecastNextText(x) || '-'}</Text></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
