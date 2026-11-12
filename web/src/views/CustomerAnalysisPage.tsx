import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
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
const STATUS = {'곧 주문': 'yellow', '이탈 의심': 'red', '정상': 'green', '데이터부족': 'neutral'} as const;
interface Row {거래처: string; orderDays: number; lastOrder: Date; interval: number | null; next: Date | null; daysToNext: number | null; status: keyof typeof STATUS; qty6: number; amt6: number; top: {pn: string; qty: number; name: string}[]}

/** 거래처 분석: 주문일이 3일 이상 쌓인 거래처만 주문 간격과 다음 주문을 계산 (판매실적에 있는 값만 사용) */
export function CustomerAnalysisPage() {
  useStore();
  const rows = (state.loaded ? customerAnalysis() : []) as Row[];
  return (
    <PageFrame view="customers">
      {!state.loaded ? <NoData /> : rows.length === 0 ? (
        <Card><EmptyState headingLevel={2} title="판매실적이 없습니다." description="판매실적을 올리면 거래처별 주문 주기를 계산합니다." /></Card>
      ) : (
        <VStack gap={3}>
          <HStack gap={2} wrap="wrap">
            {(['곧 주문', '이탈 의심', '정상', '데이터부족'] as const).map(s => <Badge key={s} variant={STATUS[s]} label={`${s} ${fmt(rows.filter(r => r.status === s).length)}곳`} />)}
          </HStack>
          <Card padding={0}>
            <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 960}}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className="sticky-col" style={{width: 200}}>거래처</TableHeaderCell>
                  <TableHeaderCell style={{width: 96}}>상태</TableHeaderCell>
                  <TableHeaderCell style={{width: 110}}>마지막 주문</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 90}}>주문 간격</TableHeaderCell>
                  <TableHeaderCell style={{width: 150}}>다음 주문 예상</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 100}}>6개월 수량</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 120}}>6개월 금액</TableHeaderCell>
                  <TableHeaderCell style={{width: 240}}>주요 품목 (6개월)</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.거래처}>
                    <TableCell className="sticky-col">{r.거래처}</TableCell>
                    <TableCell><Badge variant={STATUS[r.status]} label={r.status} /></TableCell>
                    <TableCell>{day(r.lastOrder)}</TableCell>
                    <TableCell className="num">{r.interval ? `${fmt(r.interval)}일` : '-'}</TableCell>
                    <TableCell>{r.next ? <>{day(r.next)} <Text type="supporting">{r.daysToNext! < 0 ? `${-r.daysToNext!}일 지남` : `${r.daysToNext}일 후`}</Text></> : <Text type="supporting">주문 {r.orderDays}일 (3일 이상 필요)</Text>}</TableCell>
                    <TableCell className="num">{fmt(r.qty6)}</TableCell>
                    <TableCell className="num">{fmt(r.amt6)}</TableCell>
                    <TableCell><span className="chip-list">{r.top.map(t => <span key={t.pn}><ProductLink pn={t.pn} /> <span className="muted">{fmt(t.qty)}</span></span>)}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Text type="supporting">주문 간격 = (첫 주문일 ~ 마지막 주문일) ÷ (주문일 수 − 1). 다음 주문이 간격 이상 늦어지면 '이탈 의심', 14일 이내면 '곧 주문'. 판매실적 파일에 있는 기간만 반영됩니다.</Text>
        </VStack>
      )}
    </PageFrame>
  );
}
