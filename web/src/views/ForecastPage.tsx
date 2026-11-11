import {PageFrame} from './PageFrame';
import {MigrationPlaceholder} from './MigrationPlaceholder';

export function ForecastPage() {
  return (
    <PageFrame view="forecast">
      <MigrationPlaceholder
        phase="6단계-④"
        features={[
          '발주 현황 표: 등급, 가용재고, 입고예정, 분기 수요, 발주 권장 수량, 소진 예상일, 발주 여유일',
          '등급 · 브랜드 · 거래처 · 품번 칩 필터와 검색',
          '행 펼치기: 거래처별 발주 패턴, 다음 주문 예상일, 최근 6개월 판매 내역',
          '과잉재고 범위 (전체 / 팀 창고 / EMP)',
          '등급 기준 · 히어로 기준 편집 (업데이트 권한자만)',
          '목록 / 상세 CSV 다운로드',
        ]}
      />
    </PageFrame>
  );
}
