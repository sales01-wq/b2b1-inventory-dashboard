import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Drawer} from '@astryxdesign/core/Drawer';
import {DrawerHeader} from '@astryxdesign/core/Drawer';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useStore} from '../app/useStore';
import {state, ui} from '../lib/store.js';
import {addToCart, closeDetail, lookupFor, productDetail} from '../lib/insights.js';
import {expiryRows, forecastNextText, incomingChips, warehouseRows} from '../lib/views.js';
import {lookupSearch} from '../lib/actions.js';
import {fmt} from '../lib/format';
import {GradeBadge} from './ForecastPage';
import {BarChart} from './BarChart';

/** 모든 화면 공통 상품 상세 (우측 패널): 핵심 수치 · 월별 판매 · 창고 · 입고예정 · LOT · 거래처별 주문 패턴 */
export function ProductDetail({go}: {go: (v: 'lookup') => void}) {
  useStore();
  const pn: string = ui.detailPn;
  const d = pn ? productDetail(pn) : null;
  const x = d && d.item;
  const wh = d ? warehouseRows(pn) : null;
  const inc = d && state.schByProduct.get(pn) ? incomingChips(state.schByProduct.get(pn)) : [];
  const lots = d ? expiryRows(pn) : null;
  const lotList: {lot: string; date: string; avail: number}[] = lots ? lots.rows : [];
  return (
    <Drawer isOpen={!!pn} onOpenChange={o => { if (!o) closeDetail(); }} label="상품 상세" width={560}>
      {d && (
        <VStack gap={5} padding={5}>
          <DrawerHeader title={<HStack gap={2} vAlign="center" wrap="wrap"><code>{pn}</code>{x && <GradeBadge grade={x.grade} />}</HStack>} subtitle={d.name || '품명 없음'} endContent={<IconButton label="닫기" size="sm" variant="ghost" icon={<Icon icon="close" />} onClick={closeDetail} />} />
          {!x ? <Text type="supporting">이 품번은 현재 발주 현황 대상(브랜드 규칙)에 없어서 계산 결과가 없습니다.</Text> : (
            <>
              <div className="detail-stats">
                <Stat label="가용재고" value={fmt(x.available)} />
                <Stat label="입고예정(3개월)" value={fmt(x.incoming)} />
                <Stat label="월평균 판매" value={fmt(x.avgQuarterly / 3)} />
                <Stat label="발주할 수량" value={x.orderQty > 0 ? fmt(x.orderQty) : '-'} strong={x.orderQty > 0} />
                <Stat label="소진 예상" value={d.depletion === null ? '판매 없음' : `${fmt(d.depletion)}일`} />
                <Stat label="다음 주문" value={forecastNextText(x) || '-'} small />
              </div>
              <HStack gap={2} wrap="wrap">
                <Button label="발주 목록에 담기" size="sm" onClick={() => addToCart(pn)} />
                <Button label="조회에서 확인" size="sm" variant="secondary" onClick={() => { lookupFor(pn, x.orderQty); lookupSearch(); closeDetail(); go('lookup'); }} />
              </HStack>
            </>
          )}
          <VStack gap={2}>
            <HStack gap={2} hAlign="between" vAlign="end"><Heading level={3}>월별 판매 (최근 12개월)</Heading><Text type="supporting">합계 {fmt(d.monthTotal)}</Text></HStack>
            {d.monthTotal > 0 ? <BarChart data={d.months} label={`${pn} 월별 판매`} /> : <Text type="supporting">최근 12개월 판매 이력이 없습니다.</Text>}
          </VStack>
          <VStack gap={2}>
            <Heading level={3}>창고별 재고</Heading>
            <Table density="compact" dividers="rows" className="fixed-cols">
              <TableHeader><TableRow><TableHeaderCell>창고</TableHeaderCell><TableHeaderCell className="num">가용</TableHeaderCell><TableHeaderCell className="num">현재고</TableHeaderCell></TableRow></TableHeader>
              <TableBody>{wh!.rows.map((r: {창고: string; 가용재고: number; 현재고: number}) => <TableRow key={r.창고}><TableCell>{r.창고}</TableCell><TableCell className="num">{fmt(r.가용재고)}</TableCell><TableCell className="num">{fmt(r.현재고)}</TableCell></TableRow>)}</TableBody>
            </Table>
            {inc.length > 0 && <HStack gap={1.5} wrap="wrap">{inc.map((c: {m: string; d: string; q: number}) => <Badge key={c.m} variant="neutral" label={`${c.m} ${c.d || ''} 입고 ${fmt(c.q)}`} />)}</HStack>}
          </VStack>
          {lotList.length > 0 && (
            <VStack gap={2}>
              <Heading level={3}>LOT · 유통기한{lots && lots.warn ? ' (2년 이상 남은 LOT 없음)' : ''}</Heading>
              <Table density="compact" dividers="rows" className="fixed-cols">
                <TableHeader><TableRow><TableHeaderCell>LOT</TableHeaderCell><TableHeaderCell>유통기한</TableHeaderCell><TableHeaderCell className="num">가용</TableHeaderCell></TableRow></TableHeader>
                <TableBody>{lotList.slice(0, 12).map((e, i) => <TableRow key={e.lot + i}><TableCell>{e.lot}</TableCell><TableCell>{e.date}</TableCell><TableCell className="num">{fmt(e.avail)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </VStack>
          )}
          {d.customers.length > 0 && (
            <VStack gap={2}>
              <Heading level={3}>거래처별 주문 (분기 환산 많은 순)</Heading>
              <Table density="compact" dividers="rows" className="fixed-cols">
                <TableHeader><TableRow><TableHeaderCell>거래처</TableHeaderCell><TableHeaderCell className="num">분기 환산</TableHeaderCell><TableHeaderCell className="num">주문 횟수</TableHeaderCell></TableRow></TableHeader>
                <TableBody>{d.customers.map((c: {거래처: string; 분기환산수량: number; 주문횟수: number}) => <TableRow key={c.거래처}><TableCell>{c.거래처}</TableCell><TableCell className="num">{fmt(c.분기환산수량)}</TableCell><TableCell className="num">{fmt(c.주문횟수)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </VStack>
          )}
        </VStack>
      )}
    </Drawer>
  );
}

function Stat({label, value, strong, small}: {label: string; value: string; strong?: boolean; small?: boolean}) {
  return <div className="detail-stat"><Text type="supporting">{label}</Text><div className={'detail-val' + (strong ? ' strong' : '') + (small ? ' small' : '')}>{value}</div></div>;
}
