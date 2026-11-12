import type {ComponentType, SVGProps} from 'react';
import {
  ChartPieIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  QrCodeIcon,
  ArrowUpTrayIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import {
  ChartPieIcon as ChartPieSolid,
  ClipboardDocumentListIcon as ClipboardSolid,
  PresentationChartLineIcon as PresentationSolid,
  QrCodeIcon as QrCodeSolid,
  ArrowUpTrayIcon as ArrowUpTraySolid,
  ShoppingCartIcon as CartSolid,
  UserGroupIcon as UserGroupSolid,
  HeartIcon as HeartSolid,
} from '@heroicons/react/24/solid';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * 기존 index.html 의 탭(data-view)과 1:1 로 대응합니다.
 * id 값은 기존 view id 와 동일하게 유지합니다 (overview / forecast / customer / lookup / data).
 */
export type ViewId = 'overview' | 'forecast' | 'customer' | 'lookup' | 'data' | 'customers' | 'health' | 'orders';

export interface RouteDef {
  id: ViewId;
  label: string;
  description: string;
  section: '현황' | '업무 도구' | '데이터';
  icon: IconComponent;
  selectedIcon: IconComponent;
}

export const ROUTES: RouteDef[] = [
  {
    id: 'overview',
    label: '전체 개요',
    description: '오늘의 재고 상태와 발주 신호를 한눈에 확인합니다.',
    section: '현황',
    icon: ChartPieIcon,
    selectedIcon: ChartPieSolid,
  },
  {
    id: 'forecast',
    label: '발주 현황',
    description: '몇 개 품목이 얼마나 부족한지, 언제까지 발주해야 하는지 확인합니다.',
    section: '현황',
    icon: ClipboardDocumentListIcon,
    selectedIcon: ClipboardSolid,
  },
  {
    id: 'customer',
    label: '판매 현황',
    description: '거래처별 · 품목별 분기 판매 실적을 확인합니다.',
    section: '현황',
    icon: PresentationChartLineIcon,
    selectedIcon: PresentationSolid,
  },
  {
    id: 'customers',
    label: '거래처 분석',
    description: '거래처별 마지막 주문 · 주문 간격 · 다음 주문 예상을 판매실적으로 계산합니다.',
    section: '현황',
    icon: UserGroupIcon,
    selectedIcon: UserGroupSolid,
  },
  {
    id: 'health',
    label: '재고 점검',
    description: '판매가 없는 재고 · 소진이 오래 걸리는 재고 · 유통기한 임박 LOT 를 점검합니다.',
    section: '현황',
    icon: HeartIcon,
    selectedIcon: HeartSolid,
  },
  {
    id: 'orders',
    label: '발주 목록',
    description: '발주할 품목을 담고 수량을 고쳐서 CSV(엑셀)로 내려받습니다.',
    section: '업무 도구',
    icon: ShoppingCartIcon,
    selectedIcon: CartSolid,
  },
  {
    id: 'lookup',
    label: '바코드 · 거래처 조회',
    description: '바코드 · 품명 · 거래처로 품번 / 재고 / LOT 를 조회하고 출고 목록과 PLT 를 계산합니다.',
    section: '업무 도구',
    icon: QrCodeIcon,
    selectedIcon: QrCodeSolid,
  },
  {
    id: 'data',
    label: 'CSV / 엑셀 업로드',
    description: '구글시트 자동 연결과 공유 데이터 상태를 확인하고, 필요하면 엑셀을 직접 올립니다.',
    section: '데이터',
    icon: ArrowUpTrayIcon,
    selectedIcon: ArrowUpTraySolid,
  },
];

/** 기존 대시보드는 처음 열면 업로드(data) 탭이 활성 상태였습니다. */
export const DEFAULT_VIEW: ViewId = 'data';

export function isViewId(v: string): v is ViewId {
  return ROUTES.some(r => r.id === v);
}
