import {lazy, Suspense, useEffect, useState, type ComponentType} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {CubeIcon, MagnifyingGlassIcon} from '@heroicons/react/24/outline';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ErrorBoundary} from './ErrorBoundary';
import {PageSkeleton} from '../views/PageSkeleton';
import {ProductDetail} from '../views/ProductDetail';
import {SearchPalette} from '../views/SearchPalette';
import {setMode, useMode, type Mode} from './themeMode';
import {ROUTES, type RouteDef, type ViewId} from './routes';
import {useHashRoute} from './useHashRoute';
import {useStore} from './useStore';
import {StatusBanners} from './StatusBanners';
import {DEFAULT_WEBAPP_URL} from './defaults';
import {DEMO, startDemo} from './demo';
import {emit, subscribe} from '../lib/store.js';
import {shared, initSharedMode, logout} from '../data/shared.js';
import {settingsLoadLocal} from '../data/settings.js';
// 화면마다 따로 불러옴 (처음 여는 화면의 코드만 먼저 받음)
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => {
  // 첫 화면을 그린 뒤 나머지 화면도 미리 받아 둠 → 메뉴를 눌렀을 때 빈 화면 없이 바로 바뀜
  setTimeout(() => { load().catch(() => {}); }, 0);
  return lazy(() => load().then(m => ({default: m[name]})));
};
const OverviewPage = page(() => import('../views/OverviewPage'), 'OverviewPage');
const ForecastPage = page(() => import('../views/ForecastPage'), 'ForecastPage');
const SalesPage = page(() => import('../views/SalesPage'), 'SalesPage');
const LookupPage = page(() => import('../views/LookupPage'), 'LookupPage');
const DataPage = page(() => import('../views/DataPage'), 'DataPage');
const OrderListPage = page(() => import('../views/OrderListPage'), 'OrderListPage');
const CustomerAnalysisPage = page(() => import('../views/CustomerAnalysisPage'), 'CustomerAnalysisPage');
const InventoryHealthPage = page(() => import('../views/InventoryHealthPage'), 'InventoryHealthPage');

const SECTIONS: RouteDef['section'][] = ['현황', '업무 도구', '데이터'];

const PAGES: Record<ViewId, ComponentType> = {
  overview: OverviewPage,
  forecast: ForecastPage,
  customer: SalesPage,
  lookup: LookupPage,
  data: DataPage,
  orders: OrderListPage,
  customers: CustomerAnalysisPage,
  health: InventoryHealthPage,
};

// 기존 index.html 의 시작 순서: settingsLoadLocal() → renderAll() → initSharedMode()
let started = false;
function start() {
  if (started) return;
  started = true;
  if (DEMO) { settingsLoadLocal(); startDemo(); return; } // 미리보기: 로그인 · 실제 데이터 연결 없음
  shared.gsUrl = DEFAULT_WEBAPP_URL;
  settingsLoadLocal();
  emit();
  initSharedMode();
}

export function App() {
  useStore();
  const [view, navigate] = useHashRoute();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(start, []);
  // 기존처럼 데이터가 반영되면 '전체 개요'로 이동
  useEffect(() => {
    const off = subscribe((e?: {applied?: {error?: string}}) => {
      if (e && e.applied && !e.applied.error) navigate('overview');
    });
    return () => { off(); };
  }, [navigate]);

  if (shared.gated) return <LoginGate />;

  const Page = PAGES[view];
  const sideNav = (
    <SideNav
      collapsible
      header={<SideNavHeading heading="재고 관리" subheading="B2B 대시보드" icon={<span className="brand-mark"><CubeIcon width={16} height={16} aria-hidden /></span>} />}
      footer={<VStack gap={3}><ThemeToggle /><UserChip /></VStack>}>
      <div style={{padding: '0 8px 8px'}}>
        <Button label="품목 검색 (Ctrl+K)" size="sm" variant="secondary" icon={<MagnifyingGlassIcon width={16} height={16} aria-hidden />} onClick={() => setSearchOpen(true)} />
      </div>
      {SECTIONS.map(section => (
        <SideNavSection key={section} title={section}>
          {ROUTES.filter(r => r.section === section).map(r => (
            <SideNavItem
              key={r.id}
              size="sm"
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
    <AppShell sideNav={sideNav} banner={<StatusBanners />} variant="elevated" height="fill">
      <ErrorBoundary resetKey={view}>
        <Suspense fallback={<PageSkeleton />}>
          <Page />
        </Suspense>
      </ErrorBoundary>
      <ProductDetail go={navigate} />
      <SearchPalette isOpen={searchOpen} onOpenChange={setSearchOpen} />
    </AppShell>
  );
}

/** 구글 로그인 화면 (기존 #loginGate). 로그인 버튼은 구글 스크립트가 #gsiBtn 안에 그립니다. */
function LoginGate() {
  const g = shared.gate;
  return (
    <Center height="100dvh" padding={4}>
      <Card padding={8}>
        <VStack gap={3} hAlign="center">
          <Text type="label" color="secondary">B2B1팀 · INVENTORY INTELLIGENCE</Text>
          <Heading level={1}>재고 관리 대시보드</Heading>
          <Text type="body" color={g && g.isErr ? 'accent' : 'secondary'} role={g && g.isErr ? 'alert' : undefined}>
            {g ? g.msg : '로그인 정보를 확인하는 중입니다...'}
          </Text>
          <div id="gsiBtn" />
        </VStack>
      </Card>
    </Center>
  );
}

/** 로그인한 사용자 · 권한 · 로그아웃 (기존 #userChip). 로컬 업로드 모드에서는 표시하지 않음 */
function UserChip() {
  const u = shared.user;
  if (!u) return null;
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center">
        <Avatar name={u.name || u.email} src={u.picture || undefined} size="sm" />
        <VStack gap={0.5}>
          <Text type="label">{u.email}</Text>
          <Badge variant={u.isUpdater ? 'green' : 'neutral'} label={u.isUpdater ? '업데이트 권한' : '보기 전용'} />
        </VStack>
      </HStack>
      <Button label="로그아웃" size="sm" variant="ghost" onClick={logout} />
    </VStack>
  );
}

/** 화면 모드: 밝게(기본) / 어둡게 / 기기 설정 따름 */
function ThemeToggle() {
  const mode = useMode();
  return (
    <SegmentedControl label="화면 모드" size="sm" value={mode} onChange={v => setMode(v as Mode)}>
      <SegmentedControlItem value="light" label="밝게" />
      <SegmentedControlItem value="dark" label="어둡게" />
      <SegmentedControlItem value="system" label="자동" />
    </SegmentedControl>
  );
}
