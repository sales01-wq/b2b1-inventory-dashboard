import type {ReactNode} from 'react';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {ROUTES, type ViewId} from '../app/routes';

interface PageFrameProps {
  view: ViewId;
  /** 제목 오른쪽 영역 (예: 새로고침 버튼, 팀 선택) */
  actions?: ReactNode;
  children: ReactNode;
}

/** 모든 화면이 공유하는 페이지 틀: 제목 + 설명 + 본문 */
export function PageFrame({view, actions, children}: PageFrameProps) {
  const route = ROUTES.find(r => r.id === view)!;
  return (
    <Layout
      contentWidth={1520}
      header={
        <LayoutHeader hasDivider>
          <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1}>
              <Heading level={1}>{route.label}</Heading>
              <Text type="supporting">{route.description}</Text>
            </VStack>
            {actions}
          </HStack>
        </LayoutHeader>
      }
      content={<LayoutContent>{children}</LayoutContent>}
    />
  );
}
