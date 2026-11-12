import {Skeleton} from '@astryxdesign/core/Skeleton';
import {VStack} from '@astryxdesign/core/VStack';

/** 화면 코드를 받는 동안 보이는 자리표시 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="화면을 불러오는 중" style={{padding: 24}}>
      <VStack gap={4}>
        <Skeleton width={220} height={28} />
        <Skeleton width="100%" height={96} />
        <Skeleton width="100%" height={240} />
      </VStack>
    </div>
  );
}
