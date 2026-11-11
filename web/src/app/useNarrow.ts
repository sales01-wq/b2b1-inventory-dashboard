import {useSyncExternalStore} from 'react';

const QUERY = '(max-width: 767px)';

/** 휴대폰 폭인지 (화면 회전 · 창 크기 변경을 따라감) */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(QUERY).matches,
  );
}
