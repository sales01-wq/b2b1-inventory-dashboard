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
  const T = ruleThresholds(getRules());
  const signalTotal = m.nNow + m.nSoon + m.nOk;
  // 각 신호의 뜻: 발주 현황 '기준 설정'의 문구와 같은 기준 (설정을 바꾸면 같이 바뀜)
  const meaning: Record<Signal, string> = {위험: `소진예상 ${T.risk}일 미만`, 주의: `소진예상 ${T.risk}~${T.caution}일`, 여유: `소진예상 ${T.caution}일 이상`};
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
                <SignalTile key={g} grade={g} label={g} dot={SIGNAL[g]} value={c.count} note={meaning[g]}>
                  <ProgressBar label={`${g} 비율`} isLabelHidden value={c.pct} variant={SIGNAL[g]} />
                  <Text type="supporting">신호 품목 {fmt(signalTotal)}개 중 {c.pct}%</Text>
                </SignalTile>
              );
            })}
            <SignalTile grade="참고" label="참고" dot="neutral" value={m.nRef} note="휴면 · 단발성 · 데이터 부족 (신호 계산에서 제외)" />
          </div>
        </Card>
        <Text type="supporting">거래처 {fmt(m.totalCustomers)}곳 · 최근 6개월 총판매 {fmt(m.sold6moTotal)}</Text>
      </VStack>
      <UrgentItems />
    </VStack>
  );
}

/** 신호 칸: 누르면 발주 현황을 그 상태로 걸러서 엶 (발주 현황 표의 품목 수 = 이 칸의 숫자) */
function SignalTile({grade, label, value, dot, note, children}: {grade: string; label: string; value: number; dot: 'error' | 'warning' | 'success' | 'neutral'; note: string; children?: React.ReactNode}) {
  return (
    <a className="stat stat-link" href="#/forecast" onClick={() => openForecastSignal(grade)} aria-label={`${label} ${fmt(value)}개 — 발주 현황에서 보기`}>
      <VStack gap={2}>
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
          <Heading level={2}>발주 필요 (위험+주의)</Heading>
          <Text type="supporting">{list.length > shown.length ? `${fmt(list.length)}개 중 급한 순 ${shown.length}개` : `${fmt(list.length)}개`}</Text>
        </HStack>
        {list.length > 0 && (
          <Link href="#/forecast" type="supporting" onClick={() => openForecastSignal('조치필요')}>
            발주 현황에서 전체 보기
          </Link>
        )}
      </HStack>
      {list.length === 0 ? (
        <Card><EmptyState isCompact headingLevel={3} title="위험 · 주의 품목이 없습니다." description="위험 · 주의 품목이 생기면 여기에 급한 순으로 나옵니다." /></Card>
      ) : (
        <Card padding={0}>
          <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 760}}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className="sticky-col" style={{width: 104}}>품번</TableHeaderCell>
                <TableHeaderCell className="hide-narrow" style={{width: 96}}>브랜드</TableHeaderCell>
                <TableHeaderCell style={{width: 200}}>품명</TableHeaderCell>
                <TableHeaderCell style={{width: 88}}>상태</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 92}}>발주할 수량</TableHeaderCell>
                <TableHeaderCell className="num" style={{width: 84}}>가용재고</TableHeaderCell>
                <TableHeaderCell style={{width: 160}}>다음 주문</TableHeaderCell>
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
    </VStack>
  );
}
