import {PageFrame} from './PageFrame';
import {MigrationPlaceholder} from './MigrationPlaceholder';

export function OverviewPage() {
  return (
    <PageFrame view="overview">
      <MigrationPlaceholder
        phase="6단계-②"
        features={[
          '재고 신호등: 위험 / 주의 / 여유 / 참고 4단계 요약',
          '등급별 도넛 차트와 품목 수',
          '히어로 품목 알림 (설정 수량 이하로 떨어진 품목)',
          '브랜드(성분에디터 · 밀크터치 · 마미케어) · 팀 필터 반영',
        ]}
      />
    </PageFrame>
  );
}
