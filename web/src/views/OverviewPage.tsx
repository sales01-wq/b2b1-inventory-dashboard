import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {GradeBadge} from './ForecastPage';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {getRules, STATUS_LABEL} from '../lib/forecast.js';
import {overviewModel, urgentItems} from '../lib/views.js';
import {openForecastSignal} from '../lib/actions.js';
import {ProductLink} from './ProductLink';
import {fmt} from '../lib/format';
import {BarChart} from './BarChart';
import {customerAnalysis, inventoryHealth, totalMonthlySales} from '../lib/insights.js';

// 신호등 색: 위험 · 주의 · 여유 (Astryx 상태색)
const SIGNAL = {위험: 'error', 주의: 'warning', 여유: 'success'} as const;
type Signal = keyof typeof SIGNAL;
const URGENT_SHOWN = 8;
interface URow {품번: string; 품명: string; brand: string; grade: string; orderQty: number; available: number}

export function OverviewPage() {
  useStore();
  return (
    <PageFrame view="overview">
      <VStack gap={5}>
        <HeroAlert />
        {state.loaded ? <Overview /> : <NoData />}
      </VStack>
    </PageFrame>
  );
}

function Overview() {
  const m = overviewModel();
  const R = getRules();
  const signalTotal = m.nNow + m.nSoon + m.nOk;
  // 각 신호의 뜻: 발주 현황 '기준 설정'의 문구와 같은 기준 (설정을 바꾸면 같이 바뀜)
  const meaning: Record<Signal, string> = {위험: `재고가 목표의 ${R.riskPct}% 미만`, 주의: `재고가 목표의 ${R.riskPct}~100%`, 여유: '부족 수량 없음'};
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <HStack gap={2} hAlign="between" vAlign="end" wrap="wrap">
          <Heading level={2}>재고 신호등</Heading>
          <Text type="supporting">품목 {fmt(m.total)}개{m.brands.length > 0 ? ' · ' + m.brands.join(', ') : ''}</Text>
        </HStack>
        <Card padding={0}>
          <div className="stat-strip">
            {m.circles.map(c => {
              const g = c.label as Signal;
              return (
                <SignalTile key={g} grade={g} label={STATUS_LABEL[g]} dot={SIGNAL[g]} value={c.count} note={meaning[g]}>
                  <ProgressBar label={`${STATUS_LABEL[g]} 비율`} isLabelHidden value={c.pct} variant={SIGNAL[g]} />
                  <Text type="supporting">신호 품목 {fmt(signalTotal)}개 중 {c.pct}%</Text>
                </SignalTile>
              );
            })}
            <SignalTile grade="참고" label="참고" dot="neutral" value={m.nRef} note="최근 12개월 판매 없음 (신호 계산에서 제외)" />
          </div>
        </Card>
        <Text type="supporting">거래처 {fmt(m.totalCustomers)}곳 · 최근 6개월 총판매 {fmt(m.sold6moTotal)}</Text>
      </VStack>
      <UrgentItems />
      <Insights />
    </VStack>
  );
}

/** 신호 칸: 누르면 생산 필요 현황을 그 상태로 걸러서 엶 (발주 현황 표의 품목 수 = 이 칸의 숫자) */
function SignalTile({grade, label, value, dot, note, children}: {grade: string; label: string; value: number; dot: 'error' | 'warning' | 'success' | 'neutral'; note: string; children?: React.ReactNode}) {
  return (
    <a className="stat stat-link" href="#/forecast" onClick={() => openForecastSignal(grade)} aria-label={`${label} ${fmt(value)}개 — 생산 필요 현황에서 보기`}>
      <VStack gap={1.5}>
        <HStack gap={1.5} vAlign="center" hAlign="between">
          <HStack gap={1.5} vAlign="center">
            <StatusDot variant={dot} label={label} />
            <Text type="label" weight="medium">{label}</Text>
          </HStack>
          <span className="stat-chevron"><Icon icon="chevronRight" size="sm" /></span>
        </HStack>
        <Text type="display-3">{fmt(value)}</Text>
        {children}
        <Text type="supporting">{note}</Text>
      </VStack>
    </a>
  );
}

/** 위험 · 주의 품목: 발주 현황 '발주 필요 (위험+주의)' 칩과 같은 품목 · 같은 정렬. 발주할 수량이 0 인 품목도 있음 (등급 기준이라서) */
function UrgentItems() {
  const list: URow[] = urgentItems();
  const shown = list.slice(0, URGENT_SHOWN);
  return (
    <VStack gap={2}>
      <HStack gap={2} hAlign="between" vAlign="end" wrap="wrap">
        <HStack gap={2} vAlign="end">
          <Heading level={2}>생산 필요 + 추천</Heading>
          <Text type="supporting">{list.length > shown.length ? `${fmt(list.length)}개 중 급한 순 ${shown.length}개` : `${fmt(list.length)}개`}</Text>
        </HStack>
        {list.length > 0 && (
          <Link href="#/forecast" type="supporting" onClick={() => openForecastSignal('조치필요')}>
            생산 필요 현황에서 전체 보기
          </Link>
        )}
      </HStack>
      {list.length === 0 ? (
        <Card><EmptyState isCompact headingLevel={3} title="생산 필요 · 추천 품목이 없습니다." description="생산 필요 · 추천 품목이 생기면 여기에 급한 순으로 나옵니다." /></Card>
      ) : (
        <Card padding={0}>
          <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 600}}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className="sticky-col" style={{width: 104}}>품번</TableHeaderCell>
                <TableHeaderCell className="hide-narrow" style={{width: 96}}>브랜드</TableHeaderCell>
                <TableHeaderCell style={{width: 200}}>품명</TableHeaderCell>
                <TableHeaderCell style={{width: 88}}>상태</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 92}}>부족 수량</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 84}}>가용재고</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(x => (
                <TableRow key={x.품번}>
                  <TableCell className="sticky-col"><ProductLink pn={x.품번} /></TableCell>
                  <TableCell className="hide-narrow"><BrandBadge brand={x.brand} /></TableCell>
                  <TableCell>{x.품명}<span className="show-narrow"><BrandBadge brand={x.brand} /></span></TableCell>
                  <TableCell><GradeBadge grade={x.grade} /></TableCell>
                  <TableCell className={x.orderQty > 0 ? 'num strong' : 'num muted'}>{fmt(x.orderQty)}</TableCell>
                  <TableCell className="num">{fmt(x.available)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}

/** 실제 판매실적 · 재고 · 유통기한으로 만든 요약 3칸: 월별 판매 · 재고 점검 · 곧 주문할 거래처 */
function Insights() {
  const months = totalMonthlySales();
  const h = inventoryHealth(90);
  const custs = (customerAnalysis() as {거래처: string; daysSince: number; qty6: number}[]).filter(c => c.qty6 > 0 && c.daysSince > 90).sort((a, b) => b.qty6 - a.qty6).slice(0, 5);
  const total = months.reduce((a: number, m: {qty: number}) => a + m.qty, 0);
  return (
    <div className="overview-grid">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} hAlign="between" vAlign="end"><Heading level={2}>월별 판매</Heading><Text type="supporting">최근 12개월 {fmt(total)}</Text></HStack>
          {total > 0 ? <BarChart data={months} label="최근 12개월 월별 판매 수량" /> : <Text type="supporting">최근 12개월 판매 이력이 없습니다.</Text>}
        </VStack>
      </Card>
      <Card>
        <VStack gap={2}>
          <Heading level={2}>재고 점검</Heading>
          <HealthLine href="#/health" label="90일 안에 유통기한이 끝나는 LOT" value={`${fmt(h.expiring.length)}개`} />
          <HealthLine href="#/health" label="6개월간 판매 없는 재고 품목" value={`${fmt(h.idle.length)}개`} />
          <HealthLine href="#/health" label="소진까지 1년 넘는 재고 품목" value={`${fmt(h.slow.length)}개`} />
        </VStack>
      </Card>
      <Card>
        <VStack gap={2}>
          <HStack gap={2} hAlign="between" vAlign="end"><Heading level={2}>오래 주문 없는 거래처</Heading><Link href="#/customers" type="supporting">거래처 분석</Link></HStack>
          {custs.length === 0 ? <Text type="supporting">최근 6개월 판매가 있는 거래처 중 90일 넘게 주문이 없는 곳이 없습니다.</Text> : custs.map(c => (
            <HStack key={c.거래처} hAlign="between" gap={2}><Text type="label">{c.거래처}</Text><Text type="supporting">{c.daysSince}일 전 마지막 주문</Text></HStack>
          ))}
        </VStack>
      </Card>
    </div>
  );
}
function HealthLine({href, label, value}: {href: string; label: string; value: string}) {
  return <a className="health-line" href={href}><Text type="label">{label}</Text><Text type="label" weight="semibold">{value}</Text></a>;
}
