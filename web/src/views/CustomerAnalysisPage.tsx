import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {ProductLink} from './ProductLink';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {customerAnalysis} from '../lib/insights.js';
import {fmt} from '../lib/format';

const day = (d: Date | null) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '-';
interface Row {거래처: string; orderDays: number; lastOrder: Date; daysSince: number; qty6: number; amt6: number; top: {pn: string; qty: number; name: string}[]}

/** 거래처 분석: 판매실적에 있는 과거 값만 보여 줌 (부족 수량 · 발주 판단은 발주 현황) */
export function CustomerAnalysisPage() {
  useStore();
  const rows = (state.loaded ? customerAnalysis() : []) as Row[];
  return (
    <PageFrame view="customers">
      {!state.loaded ? <NoData /> : rows.length === 0 ? (
        <Card><EmptyState headingLevel={2} title="판매실적이 없습니다." description="판매실적을 올리면 거래처별 주문 주기를 계산합니다." /></Card>
      ) : (
        <VStack gap={3}>
          <Card padding={0}>
            <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 880}}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className="sticky-col" style={{width: 200}}>거래처</TableHeaderCell>
                  <TableHeaderCell style={{width: 110}}>마지막 주문</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 100}}>경과일</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 100}}>주문일 수</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 100}}>6개월 수량</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 120}}>6개월 금액</TableHeaderCell>
                  <TableHeaderCell style={{width: 240}}>주요 품목 (6개월)</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.거래처}>
                    <TableCell className="sticky-col">{r.거래처}</TableCell>
                    <TableCell>{day(r.lastOrder)}</TableCell>
                    <TableCell className="num">{fmt(r.daysSince)}일</TableCell>
                    <TableCell className="num">{fmt(r.orderDays)}</TableCell>
                    <TableCell className="num">{fmt(r.qty6)}</TableCell>
                    <TableCell className="num">{fmt(r.amt6)}</TableCell>
                    <TableCell><span className="chip-list">{r.top.map(t => <span key={t.pn}><ProductLink pn={t.pn} /> <span className="muted">{fmt(t.qty)}</span></span>)}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Text type="supporting" className="scroll-hint">표는 옆으로 밀어서 볼 수 있습니다 (거래처 열은 고정).</Text>
          <Text type="supporting">경과일 = 마지막 주문일부터 오늘까지. 주문일 수 = 판매실적 파일에서 주문이 있었던 서로 다른 날짜 수. 판매실적 파일에 있는 기간만 반영되며 반품은 제외합니다.</Text>
        </VStack>
      )}
    </PageFrame>
  );
}
