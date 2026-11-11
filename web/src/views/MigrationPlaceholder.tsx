import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {HStack} from '@astryxdesign/core/HStack';
import {WrenchScrewdriverIcon} from '@heroicons/react/24/outline';

interface Props {
  /** 이 화면으로 옮겨올 기존 기능 목록 */
  features: string[];
  /** 마이그레이션 계획상 단계 */
  phase: string;
}

/** 기능 이전 전까지 보여주는 자리 표시 화면 */
export function MigrationPlaceholder({features, phase}: Props) {
  return (
    <VStack gap={4}>
      <EmptyState
        icon={<WrenchScrewdriverIcon width={40} height={40} />}
        title="이 화면은 이전 작업 예정입니다"
        description="현재 운영 중인 대시보드(index.html)는 그대로 동작합니다. 아래 기능이 이 화면으로 옮겨집니다."
      />
      <Card>
        <VStack gap={3}>
          <HStack gap={2} vAlign="center">
            <Text type="label">옮겨올 기능</Text>
            <Badge variant="blue" label={phase} />
          </HStack>
          <ul className="feature-list">
            {features.map(f => (
              <li key={f}>
                <Text type="body">{f}</Text>
              </li>
            ))}
          </ul>
        </VStack>
      </Card>
    </VStack>
  );
}
