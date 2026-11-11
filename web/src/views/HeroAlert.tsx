import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {heroAlertModel} from '../lib/views.js';
import {fmt} from '../lib/format';

/** 히어로 품목 위험 알람 (기존 #heroAlertOverview / #heroAlertForecast): 얇은 경고 상자 */
export function HeroAlert() {
  const m = heroAlertModel();
  if (!m) return null;
  return (
    <div className="alert alert-error" role="alert">
      <HStack gap={2} vAlign="center">
        <Icon icon="warning" color="error" size="sm" />
        <Text type="label" weight="semibold">히어로 품목 위험 알람 ({fmt(m.count)}개) — {m.team}</Text>
      </HStack>
      <ul className="alert-list">
        {m.items.map((x: {품번: string; 품명: string; available: number; heroMin: number}, i: number) => (
          <li key={x.품번 + i}>
            <Text type="supporting" color="primary">
              <strong>{x.품명}</strong> <code>{x.품번}</code> — 가용재고 <strong>{fmt(x.available)}</strong> ≤ 기준 {fmt(x.heroMin)}
            </Text>
          </li>
        ))}
      </ul>
      {m.more > 0 && <Text type="supporting">외 {m.more}개</Text>}
    </div>
  );
}
