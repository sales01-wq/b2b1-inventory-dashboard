import {PageFrame} from './PageFrame';
import {MigrationPlaceholder} from './MigrationPlaceholder';

export function DataPage() {
  return (
    <PageFrame view="data">
      <MigrationPlaceholder
        phase="6단계-①"
        features={[
          '공유 데이터(구글 로그인) 상태: 마지막 업데이트 시각 · 업데이트한 사람',
          '구글시트 자동 연결 · 🔄 새로고침 (업데이트 권한자는 ERP 반영 시작)',
          '"새 데이터가 있습니다" 알림과 지금 적용',
          'CSV / 엑셀 수동 업로드 (시트 종류 자동 인식 5종)',
        ]}
      />
    </PageFrame>
  );
}
