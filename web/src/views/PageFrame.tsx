import type {ReactNode} from 'react';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {ROUTES, type ViewId} from '../app/routes';
import {RefreshStatus, TeamBrandFilters} from '../app/GlobalFilters';
import {useStore} from '../app/useStore';
import {metaLineText} from '../lib/views.js';

/** 모든 화면 공통 틀: 제목 줄(제목 · 설명 | 데이터 상태 · 새로고침) + 도구 줄(팀 · 브랜드 | 데이터 요약) + 본문 */
export function PageFrame({view, children}: {view: ViewId; children: ReactNode}) {
  useStore();
  const route = ROUTES.find(r => r.id === view)!;
  return (
    <Layout
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider paddingBlockEnd={3}>
          <VStack gap={3}>
            <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
              <VStack gap={0.5}>
                <Heading level={1}>{route.label}</Heading>
                <Text type="supporting">{route.description}</Text>
              </VStack>
              <RefreshStatus />
            </HStack>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <TeamBrandFilters />
              <Text type="supporting">{metaLineText()}</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={<LayoutContent>{children}</LayoutContent>}
    />
  );
}
