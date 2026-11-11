import {PageFrame} from './PageFrame';
import {MigrationPlaceholder} from './MigrationPlaceholder';

export function LookupPage() {
  return (
    <PageFrame view="lookup">
      <MigrationPlaceholder
        phase="6단계-⑤"
        features={[
          '바코드 여러 개 / 품명 / 거래처로 한 번에 조회 (대체 품번 포함)',
          '창고 · 입고예정 · 유통기한 LOT 선택, 추천 LOT 자동 선택',
          '필요 수량 입력과 우선순위별 배분',
          '출고 목록 표: 고정 열, 열 너비 조절, 박스 정보 직접 입력',
          'PLT 계산: 품목별 개별 / 혼적 모드, 예상 중량 · 규격',
          '출고 목록 CSV 다운로드',
        ]}
      />
    </PageFrame>
  );
}
