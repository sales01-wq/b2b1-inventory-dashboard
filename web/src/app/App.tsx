import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Avatar} from '@astryxdesign/core/Avatar';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {CubeIcon} from '@heroicons/react/24/outline';
import {ROUTES, type RouteDef, type ViewId} from './routes';
import {useHashRoute} from './useHashRoute';
import {OverviewPage} from '../views/OverviewPage';
import {ForecastPage} from '../views/ForecastPage';
import {SalesPage} from '../views/SalesPage';
import {LookupPage} from '../views/LookupPage';
import {DataPage} from '../views/DataPage';

const SECTIONS: RouteDef['section'][] = ['현황', '업무 도구', '데이터'];

const PAGES: Record<ViewId, () => React.ReactNode> = {
  overview: OverviewPage,
  forecast: ForecastPage,
  customer: SalesPage,
  lookup: LookupPage,
  data: DataPage,
};

export function App() {
  const [view, navigate] = useHashRoute();
  const Page = PAGES[view];

  const sideNav = (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          heading="재고 관리"
          subheading="B2B 대시보드"
          icon={<CubeIcon width={24} height={24} aria-hidden />}
        />
      }
      footer={<UserChip />}>
      {SECTIONS.map(section => (
        <SideNavSection key={section} title={section}>
          {ROUTES.filter(r => r.section === section).map(r => (
            <SideNavItem
              key={r.id}
              label={r.label}
              icon={r.icon}
              selectedIcon={r.selectedIcon}
              href={'#/' + r.id}
              isSelected={view === r.id}
              onClick={e => {
                e.preventDefault();
                navigate(r.id);
              }}
            />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  );

  return (
    <AppShell sideNav={sideNav} variant="elevated" height="fill">
      <Page />
    </AppShell>
  );
}

/** 로그인 사용자 표시 자리. 구글 로그인 연결(4단계)에서 실제 사용자 정보로 바뀝니다. */
function UserChip() {
  return (
    <HStack gap={2} vAlign="center">
      <Avatar name="게스트" size="sm" />
      <VStack gap={0}>
        <Text type="label">로그인 연결 전</Text>
        <Text type="supporting">구글 로그인 · 4단계에서 연결</Text>
      </VStack>
    </HStack>
  );
}
