import {useCallback, useEffect, useState} from 'react';
import {DEFAULT_VIEW, isViewId, type ViewId} from './routes';

/**
 * 해시(#/forecast) 기반의 아주 작은 라우터.
 * 정적 호스팅(Vercel)에서 별도 rewrite 설정 없이 새로고침 · 북마크가 동작합니다.
 */
function readHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return isViewId(raw) ? raw : DEFAULT_VIEW;
}

export function useHashRoute(): [ViewId, (v: ViewId) => void] {
  const [view, setView] = useState<ViewId>(readHash);

  useEffect(() => {
    const onChange = () => setView(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((v: ViewId) => {
    if (readHash() !== v) window.location.hash = '/' + v;
  }, []);

  return [view, navigate];
}
