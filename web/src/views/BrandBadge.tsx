import {Badge} from '@astryxdesign/core/Badge';

// 기존 brandBadge 의 브랜드 색(장미 · 파랑 · 초록)에 가까운 Astryx 배지 색
const VARIANT = {성분에디터: 'pink', 밀크터치: 'blue', 마미케어: 'green'} as const;

export function BrandBadge({brand}: {brand: string | null}) {
  if (!brand) return null;
  return <Badge variant={VARIANT[brand as keyof typeof VARIANT] || 'neutral'} label={brand} />;
}
