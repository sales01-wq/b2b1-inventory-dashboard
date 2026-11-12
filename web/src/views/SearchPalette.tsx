import {useMemo} from 'react';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import {openDetail, searchProducts} from '../lib/insights.js';

/** 전체 검색 (Ctrl+K): 품번 · 품명 · 바코드. 최대 30개만 보여 주고, 고르면 상품 상세가 열림 */
export function SearchPalette({isOpen, onOpenChange}: {isOpen: boolean; onOpenChange: (o: boolean) => void}) {
  const source = useMemo(() => ({
    search: (q: string): SearchableItem[] => searchProducts(q).map((x: {품번: string; 품명: string; brand: string}) => ({id: x.품번, label: `${x.품번}  ${x.품명}`, auxiliaryData: {group: x.brand || '기타'}})),
    bootstrap: (): SearchableItem[] => [],
  }), []);
  return (
    <CommandPalette isOpen={isOpen} onOpenChange={onOpenChange} searchSource={source} label="품목 검색" emptySearchText="일치하는 품목이 없습니다." emptyBootstrapText="품번 · 품명 · 바코드를 입력하세요."
      onValueChange={id => { onOpenChange(false); openDetail(id); }} />
  );
}
