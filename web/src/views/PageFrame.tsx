import type {ReactNode} from 'react';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {ROUTES, type ViewId} from '../app/routes';
import {GlobalFilters} from '../app/GlobalFilters';
import {useStore} from '../app/useStore';
import {metaLineText} from '../lib/views.js';

/** 모든 화면이 공유하는 틀: 제목 · 설명 · 데이터 요약(기존 metaLine) · 팀/브랜드/새로고침 + 본문 */
export function PageFrame({view, children}: {view: ViewId; children: ReactNode}) {
  useStore();
  const route = ROUTES.find(r => r.id === view)!;
  return (
    <Layout
      contentWidth={1520}
      header={
        <LayoutHeader hasDivider>
          <VStack gap={3}>
            <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
              <VStack gap={1}>
                <Heading level={1}>{route.label}</Heading>
                <Text type="supporting">{route.description}</Text>
              </VStack>
              <GlobalFilters />
            </HStack>
            <Text type="supporting">{metaLineText()}</Text>
          </VStack>
        </LayoutHeader>
      }
      content={<LayoutContent>{children}</LayoutContent>}
    />
  );
}
