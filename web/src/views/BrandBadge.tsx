import {BRAND_COLORS} from '../lib/forecast.js';

/** 브랜드 표시: 기존 브랜드 색(BRAND_COLORS)의 작은 점 + 이름 (색만으로 구분하지 않음) */
export function BrandBadge({brand}: {brand: string | null}) {
  if (!brand) return null;
  return (
    <span className="brand-label">
      <span className="brand-dot" style={{background: (BRAND_COLORS as Record<string, string>)[brand] || 'var(--color-text-secondary)'}} aria-hidden />
      {brand}
    </span>
  );
}
