import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {NoData} from './NoData';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {overviewModel} from '../lib/views.js';
import {fmt} from '../lib/format';

// 신호등 색: 위험 · 주의 · 여유 (Astryx 상태색)
const SIGNAL = {위험: 'error', 주의: 'warning', 여유: 'success'} as const;
type Signal = keyof typeof SIGNAL;

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
  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={2}>재고 신호등 — 전체 품목 발주 상태</Heading>
          <Text type="supporting">품목 {fmt(m.total)}개{m.brands.length > 0 ? ' · ' + m.brands.join(', ') : ''}</Text>
        </HStack>
        <Card padding={0}>
          <div className="stat-strip">
            {m.circles.map(c => (
              <Stat key={c.label} label={c.label} dot={SIGNAL[c.label as Signal]} value={c.count} note={`신호 품목의 ${c.pct}%`}>
                <ProgressBar label={`${c.label} 비율`} isLabelHidden value={c.pct} variant={SIGNAL[c.label as Signal]} />
              </Stat>
            ))}
            <Stat label="참고 (휴면·단발성)" dot="neutral" value={m.nRef} note="신호 계산에서 제외" />
          </div>
        </Card>
      </VStack>
      <Card padding={0}>
        <div className="stat-strip">
          <Stat label="거래처 수" value={m.totalCustomers} />
          <Stat label="최근 6개월 총판매" value={m.sold6moTotal} />
        </div>
      </Card>
    </VStack>
  );
}

/** 숫자 하나를 보여주는 칸: 이름 · 큰 숫자 · 보조 설명 · (선택) 막대 */
function Stat({label, value, dot, note, children}: {label: string; value: number; dot?: 'error' | 'warning' | 'success' | 'neutral'; note?: string; children?: React.ReactNode}) {
  return (
    <VStack gap={2} className="stat">
      <HStack gap={1.5} vAlign="center">
        {dot && <StatusDot variant={dot} label={label} />}
        <Text type="supporting">{label}</Text>
      </HStack>
      <Text type="display-3">{fmt(value)}</Text>
      {children}
      {note && <Text type="supporting">{note}</Text>}
    </VStack>
  );
}
