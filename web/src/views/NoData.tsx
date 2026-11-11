import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';

/** 데이터가 아직 없을 때 (기존 renderEmptyState 문구) */
export function NoData() {
  return (
    <EmptyState
      headingLevel={2} // 페이지 제목(h1) 바로 아래
      title="아직 데이터가 없습니다."
      description="'CSV / 엑셀 업로드' 탭에서 파일을 올려주세요."
      actions={<Button label="CSV / 엑셀 업로드로 이동" variant="primary" onClick={() => { window.location.hash = '/data'; }} />}
    />
  );
}
