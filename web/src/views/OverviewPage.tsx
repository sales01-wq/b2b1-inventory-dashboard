import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {HeroAlert} from './HeroAlert';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {overviewModel} from '../lib/views.js';
import {fmt} from '../lib/format';

// 신호등: 기존 도넛의 색(위험 · 주의 · 여유)을 Astryx 상태색으로
const SIGNAL = {위험: 'error', 주의: 'warning', 여유: 'success'} as const;
type Signal = keyof typeof SIGNAL;

export function OverviewPage() {
  useStore();
  return (
    <PageFrame view="overview">
      {state.loaded ? <Overview /> : <NoData />}
    </PageFrame>
  );
}

function Overview() {
  const m = overviewModel();
  const cards: [string, number, 'error' | 'warning' | 'success' | 'neutral' | 'accent'][] = [
    ['위험', m.nNow, 'error'],
    ['주의', m.nSoon, 'warning'],
    ['여유', m.nOk, 'success'],
    ['참고 (휴면·단발성)', m.nRef, 'neutral'],
    ['거래처 수', m.totalCustomers, 'accent'],
    ['최근 6개월 총판매', m.sold6moTotal, 'neutral'],
  ];
  return (
    <VStack gap={4}>
      <HeroAlert />
      <Card>
        <VStack gap={4}>
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <Heading level={2}>재고 신호등 — 전체 품목 발주 상태</Heading>
            <Text type="supporting">품목 {fmt(m.total)}개{m.brands.length > 0 ? ' · ' + m.brands.join(', ') : ''}</Text>
          </HStack>
          <Grid columns={{minWidth: 200, repeat: 'fit'}} gap={4}>
            {m.circles.map(c => (
              <VStack key={c.label} gap={2}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <HStack gap={1.5} vAlign="center">
                    <StatusDot variant={SIGNAL[c.label as Signal]} label={c.label} />
                    <Text type="label">{c.label}</Text>
                  </HStack>
                  <Text type="supporting">{c.pct}%</Text>
                </HStack>
                <Text type="display-3">{fmt(c.count)}</Text>
                <ProgressBar label={`${c.label} 비율`} isLabelHidden value={c.pct} variant={SIGNAL[c.label as Signal]} />
              </VStack>
            ))}
          </Grid>
        </VStack>
      </Card>
      <Grid columns={{minWidth: 170}} gap={3}>
        {cards.map(([k, v, dot]) => (
          <Card key={k}>
            <VStack gap={2}>
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant={dot} label={k} />
                <Text type="label" color="secondary">{k}</Text>
              </HStack>
              <Text type="display-3">{fmt(v)}</Text>
            </VStack>
          </Card>
        ))}
      </Grid>
    </VStack>
  );
}

/** 데이터가 아직 없을 때 (기존 renderEmptyState 문구) */
function NoData() {
  return (
    <VStack gap={4}>
      <HeroAlert />
      <EmptyState
        title="아직 데이터가 없습니다."
        description="'CSV / 엑셀 업로드' 탭에서 파일을 올려주세요."
        actions={<Button label="CSV / 엑셀 업로드로 이동" variant="primary" onClick={() => { window.location.hash = '/data'; }} />}
      />
    </VStack>
  );
}
