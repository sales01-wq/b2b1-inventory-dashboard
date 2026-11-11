import {useLayoutEffect, useRef, useSyncExternalStore} from 'react';

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

/** 휴대폰: 기간이 열로 나열된 표를 가장 최근 기간(오른쪽 끝, 합계 포함)이 보이게 열어 줌. 열 구성(key)이 바뀔 때만 (사용자가 옮긴 위치는 유지) */
export function useScrollRecent(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  useLayoutEffect(() => {
    const w = narrow ? ref.current?.querySelector('.astryx-table-scroll-wrapper') : null;
    if (w) w.scrollLeft = w.scrollWidth;
  }, [narrow, key]);
  return ref;
}
