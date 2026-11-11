import type {ReactNode} from 'react';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {ROUTES, type ViewId} from '../app/routes';
import {FilterButton, RefreshStatus, TeamBrandFilters} from '../app/GlobalFilters';
import {useStore} from '../app/useStore';
import {useNarrow} from '../app/useNarrow';
import {metaSummaryText} from '../lib/views.js';

/**
 * 모든 화면 공통 틀: 제목 줄(제목 · 설명 | 데이터 상태 · 새로고침) + 도구 줄(팀 · 브랜드 | 데이터 요약) + 본문.
 * 휴대폰: 제목 줄과 '필터' 버튼 하나만, 본문과 함께 스크롤되어 표가 화면을 쓰게 함.
 */
export function PageFrame({view, children}: {view: ViewId; children: ReactNode}) {
  useStore();
  const narrow = useNarrow();
  const route = ROUTES.find(r => r.id === view)!;
  const title = (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <VStack gap={0.5}>
        <Heading level={1}>{route.label}</Heading>
        {!narrow && <Text type="supporting">{route.description}</Text>}
      </VStack>
      <RefreshStatus />
    </HStack>
  );
  if (narrow) {
    return (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={4}>
              <VStack gap={3}>
                {title}
                <FilterButton />
              </VStack>
              {children}
            </VStack>
          </LayoutContent>
        }
      />
    );
  }
  return (
    <Layout
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider paddingBlockEnd={3}>
          <VStack gap={3}>
            {title}
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <TeamBrandFilters />
              <Text type="supporting">{metaSummaryText()}</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={<LayoutContent>{children}</LayoutContent>}
    />
  );
}
