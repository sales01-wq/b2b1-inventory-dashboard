import {useSyncExternalStore} from 'react';
import {getVersion, subscribe} from '../lib/store.js';

/** 계산 모듈의 상태(state · ui · settings · shared)가 바뀌면(emit) 화면을 다시 그립니다. */
export function useStore(): number {
  return useSyncExternalStore(subscribe, getVersion);
}
