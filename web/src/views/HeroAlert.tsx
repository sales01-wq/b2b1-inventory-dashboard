import {Banner} from '@astryxdesign/core/Banner';
import {Text} from '@astryxdesign/core/Text';
import {heroAlertModel} from '../lib/views.js';
import {fmt} from '../lib/format';

/** 히어로 품목 위험 알람 (기존 #heroAlertOverview / #heroAlertForecast) */
export function HeroAlert() {
  const m = heroAlertModel();
  if (!m) return null;
  return (
    <Banner status="error" title={`🚨 히어로 품목 위험 알람 (${fmt(m.count)}개) — ${m.team}`} collapsible={false}>
      <ul className="hero-list">
        {m.items.map((x: {품번: string; 품명: string; available: number; heroMin: number}, i: number) => (
          <li key={x.품번 + i}>
            <Text type="body" weight="bold">{x.품명}</Text> <code>{x.품번}</code> — 가용재고{' '}
            <Text type="body" weight="bold">{fmt(x.available)}</Text> ≤ 기준 {fmt(x.heroMin)}
          </li>
        ))}
      </ul>
      {m.more > 0 && <Text type="supporting">외 {m.more}개</Text>}
    </Banner>
  );
}
