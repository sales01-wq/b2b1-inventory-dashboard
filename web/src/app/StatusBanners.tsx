import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {VStack} from '@astryxdesign/core/VStack';
import {state} from '../lib/store.js';
import {shared} from '../data/shared.js';
import {syncNotice} from '../lib/views.js';
import {useStore} from './useStore';
import {DEMO} from './demo';
import {READ_ONLY} from './defaults';

/** 상단 알림: 공유 데이터 안내(sharedBar)와 파일 처리 오류(bannerZone) */
export function StatusBanners() {
  useStore();
  const b = shared.bar;
  const notice = shared.active ? syncNotice(shared.meta) : {problem: null, stale: null};
  if (!b && !shared.configProblem && !state.error && !DEMO && !READ_ONLY && !notice.problem && !notice.stale) return null;
  return (
    <VStack gap={2} padding={2}>
      {shared.configProblem && !DEMO && <Banner status="error" title="공유 데이터에 연결하지 못했습니다" description={shared.configProblem} collapsible={false} />}
      {READ_ONLY && <Banner status="warning" title="읽기 전용 미리보기" description="운영 데이터를 바꾸는 요청(설정 저장 · 서버 업데이트 · Apps Script 파일 처리)은 보내지 않습니다. 입력한 설정은 이 브라우저에만 저장됩니다." collapsible={false} />}
      {DEMO && <Banner status="info" title="미리보기 — 테스트 데이터입니다" description="실제 재고 · 판매 데이터가 아니며, 로그인과 외부 연결(구글 시트 · 서버)은 꺼져 있습니다." collapsible={false} />}
      {b && <MessageBanner msg={b} />}
      {notice.problem && <Banner status="error" title="최근 업로드 문제" description={notice.problem} collapsible={false} />}
      {notice.stale && <Banner status="warning" title="데이터가 오래되었습니다" description={notice.stale} collapsible={false} />}
      {state.error && (
        <Banner
          status="error"
          title="파일을 처리하지 못했습니다."
          description={`(${state.error}) 파일이 맞는지, 손상되지 않았는지 확인 후 다시 올려주세요.`}
        />
      )}
    </VStack>
  );
}

export interface Message {
  kind: string;
  text: string;
  detail?: string;
  progress?: number;
  action?: {label: string; run: () => void};
}

/** shared.bar / shared.gsStatus 같은 안내 문구 한 줄 */
export function MessageBanner({msg}: {msg: Message}) {
  return (
    <Banner
      status={msg.kind === 'err' ? 'error' : 'info'}
      title={msg.text}
      description={msg.detail}
      collapsible={false}
      endContent={msg.action && <Button label={msg.action.label} size="sm" variant="primary" onClick={msg.action.run} />}>
      {msg.progress !== undefined && <ProgressBar label="진행률" isLabelHidden value={msg.progress} />}
    </Banner>
  );
}
