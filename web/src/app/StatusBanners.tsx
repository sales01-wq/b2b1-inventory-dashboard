import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {VStack} from '@astryxdesign/core/VStack';
import {state} from '../lib/store.js';
import {shared} from '../data/shared.js';
import {useStore} from './useStore';

/** 상단 알림: 공유 데이터 안내(sharedBar)와 파일 처리 오류(bannerZone) */
export function StatusBanners() {
  useStore();
  const b = shared.bar;
  if (!b && !state.error) return null;
  return (
    <VStack gap={2} padding={2}>
      {b && <MessageBanner msg={b} />}
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
