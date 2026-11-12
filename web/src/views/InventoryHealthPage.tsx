import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {ProductLink} from './ProductLink';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {inventoryHealth} from '../lib/insights.js';
import {fmt} from '../lib/format';

const SHOWN = 20;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
interface Item {품번: string; 품명: string; brand: string; available: number; days?: number; avgQuarterly: number}

/** 재고 점검: 판매 없는 재고 · 소진 1년 넘는 재고 · 유통기한 임박 LOT. 재고금액(원가)과 재고 변화 이력은 올라오는 데이터에 없어 표시하지 않음 */
export function InventoryHealthPage() {
  useStore();
  const [expDays, setExpDays] = useState('180');
  if (!state.loaded) return <PageFrame view="health"><NoData /></PageFrame>;
  const h = inventoryHealth(Number(expDays));
  return (
    <PageFrame view="health">
      <VStack gap={6}>
        <Section title="유통기한 임박 LOT" note={`${fmt(h.expiring.length)}개 LOT · 가용 ${fmt(h.expiringQty)}`}
          extra={<SegmentedControl label="기간" size="sm" value={expDays} onChange={setExpDays}><SegmentedControlItem value="90" label="90일" /><SegmentedControlItem value="180" label="180일" /><SegmentedControlItem value="365" label="1년" /></SegmentedControl>}>
          {h.expiring.length === 0 ? <Empty text={`${expDays}일 안에 유통기한이 끝나는 LOT 가 없습니다. (WMS 파일의 유통기한 기준)`} /> : (
            <Tbl heads={['품번', '품명', 'LOT', '창고', '유통기한', '남은 일수', '가용']} nums={[5, 6]}>
              {h.expiring.slice(0, 50).map((e: {pn: string; 품명: string; LOT: string; 창고: string; 유통기한: Date; daysLeft: number; qty: number}, i: number) => (
                <TableRow key={e.pn + e.LOT + i}>
                  <TableCell className="sticky-col"><ProductLink pn={e.pn} /></TableCell><TableCell>{e.품명}</TableCell><TableCell>{e.LOT}</TableCell><TableCell>{e.창고}</TableCell>
                  <TableCell>{day(e.유통기한)}</TableCell><TableCell className={e.daysLeft < 0 ? 'num strong text-danger' : 'num'}>{e.daysLeft < 0 ? `${-e.daysLeft}일 지남` : `${fmt(e.daysLeft)}일`}</TableCell><TableCell className="num">{fmt(e.qty)}</TableCell>
                </TableRow>
              ))}
            </Tbl>
          )}
        </Section>
        <Section title="6개월간 판매 없는 재고" note={`${fmt(h.idle.length)}개 품목 · 가용 ${fmt(h.idleQty)}`}>
          {h.idle.length === 0 ? <Empty text="해당 품목이 없습니다." /> : <ItemTable list={h.idle} />}
        </Section>
        <Section title="소진까지 1년 넘게 걸리는 재고" note={`${fmt(h.slow.length)}개 품목 · 가용 ${fmt(h.slowQty)}`}>
          {h.slow.length === 0 ? <Empty text="해당 품목이 없습니다." /> : <ItemTable list={h.slow} days />}
        </Section>
        <Text type="supporting">소진 예상일 = 가용재고 ÷ 하루 평균 판매(분기 환산 ÷ 91.25). 재고금액(원가) 데이터와 지난 업로드와의 재고 변화는 올라오는 파일에 없어 표시하지 않습니다.</Text>
      </VStack>
    </PageFrame>
  );
}

function Section({title, note, extra, children}: {title: string; note: string; extra?: React.ReactNode; children: React.ReactNode}) {
  return (
    <VStack gap={2}>
      <HStack gap={2} hAlign="between" vAlign="end" wrap="wrap"><HStack gap={2} vAlign="end"><Heading level={2}>{title}</Heading><Text type="supporting">{note}</Text></HStack>{extra}</HStack>
      {children}
    </VStack>
  );
}
const Empty = ({text}: {text: string}) => <Card><EmptyState isCompact headingLevel={3} title={text} /></Card>;
function Tbl({heads, nums, children}: {heads: string[]; nums: number[]; children: React.ReactNode}) {
  return (
    <Card padding={0}>
      <Table className="sticky-first fixed-cols" density="compact" dividers="rows" hasHover style={{tableLayout: 'fixed', minWidth: 760}}>
        <TableHeader><TableRow>{heads.map((t, i) => <TableHeaderCell key={t} className={(i === 0 ? 'sticky-col ' : '') + (nums.includes(i) ? 'num' : '')} style={{width: i === 1 ? 220 : 100}}>{t}</TableHeaderCell>)}</TableRow></TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </Card>
  );
}
function ItemTable({list, days}: {list: Item[]; days?: boolean}) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <VStack gap={2}>
      <Tbl heads={days ? ['품번', '품명', '구분', '가용재고', '소진 예상'] : ['품번', '품명', '구분', '가용재고']} nums={days ? [3, 4] : [3]}>
        {shown.map(x => (
          <TableRow key={x.품번}>
            <TableCell className="sticky-col"><ProductLink pn={x.품번} /></TableCell><TableCell>{x.품명}</TableCell><TableCell><BrandBadge brand={x.brand} /></TableCell>
            <TableCell className="num">{fmt(x.available)}</TableCell>{days && <TableCell className="num">{fmt(x.days!)}일</TableCell>}
          </TableRow>
        ))}
      </Tbl>
      {list.length > SHOWN && <Text type="supporting"><button type="button" className="linkish" onClick={() => setAll(!all)}>{all ? '접기' : `전체 ${fmt(list.length)}개 보기`}</button></Text>}
    </VStack>
  );
}
