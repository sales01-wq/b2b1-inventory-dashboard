import {PageFrame} from './PageFrame';
import {MigrationPlaceholder} from './MigrationPlaceholder';

export function SalesPage() {
  return (
    <PageFrame view="customer">
      <MigrationPlaceholder
        phase="6단계-③"
        features={[
          '거래처별: 거래처 × 분기 판매 피벗 표 (거래처 · 품번 다중 선택)',
          '거래처별 부족 품목 요약',
          '품목별: 품번 검색 · 다중 선택 후 월별 판매 / 재고 현황',
          '품목별 현황 CSV 다운로드',
        ]}
      />
    </PageFrame>
  );
}
