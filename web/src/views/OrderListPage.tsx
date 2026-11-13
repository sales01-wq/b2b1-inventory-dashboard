import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {BrandBadge} from './BrandBadge';
import {ProductLink} from './ProductLink';
import {useStore} from '../app/useStore';
import {state} from '../lib/store.js';
import {cartCsv, cartRows, clearCart, removeFromCart, setCartQty, lookupFor} from '../lib/insights.js';
import {lookupSearch} from '../lib/actions.js';
import {fmt} from '../lib/format';
import {saveCsv} from '../lib/saveCsv';
import {useHashRoute} from '../app/useHashRoute';

const SEL = '선택 거래처 기준: ';
const scopeShort = (s: string) => (!s ? '기준 정보 없음' : s.startsWith(SEL) && s.length > SEL.length + 40 ? s.slice(0, SEL.length + 38) + '…' : s); // 전체 이름은 마우스를 올리면 보임
interface Row {pn: string; qty: number; name: string; brand: string; available: number; incoming: number; scope: string; calc: number | null; edited: boolean}

/** 발주 목록: 담은 품목의 수량을 고쳐서 CSV(엑셀에서 열림)로 내려받음. 이 브라우저에만 저장됨 */
export function OrderListPage() {
  useStore();
  const [, navigate] = useHashRoute();
  const rows: Row[] = cartRows();
  const total = rows.reduce((a, r) => a + r.qty, 0);
  return (
    <PageFrame view="orders">
      {!state.loaded && rows.length === 0 ? <NoData /> : rows.length === 0 ? (
        <Card><EmptyState headingLevel={2} title="담은 품목이 없습니다." description="생산 필요 현황 표에서 품목을 선택해 '발주 목록에 담기'를 누르거나, 품번을 눌러 열리는 상세에서 담을 수 있습니다." /></Card>
      ) : (
        <VStack gap={3}>
          <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
            <Text type="label">{fmt(rows.length)}개 품목 · 총 {fmt(total)}개 <Text type="supporting">(이 브라우저에 저장됨)</Text></Text>
            <HStack gap={2}>
              <Button label="비우기" size="sm" variant="ghost" onClick={() => { if (window.confirm('발주 목록을 모두 비울까요?')) clearCart(); }} />
              <Button label="CSV 내려받기 (엑셀에서 열림)" size="sm" variant="primary" icon={<Icon icon="arrowDown" />} onClick={() => saveCsv(cartCsv())} />
            </HStack>
          </HStack>
          <Card padding={0}>
            <Table className="sticky-first fixed-cols" density="compact" dividers="rows" style={{tableLayout: 'fixed', minWidth: 1020}}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className="sticky-col" style={{width: 110}}>품번</TableHeaderCell>
                  <TableHeaderCell style={{width: 90}}>구분</TableHeaderCell>
                  <TableHeaderCell style={{width: 220}}>품명</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 84}}>가용재고</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 84}}>입고예정</TableHeaderCell>
                  <TableHeaderCell className="num" style={{width: 104}}>담을 때 부족 수량</TableHeaderCell>
                  <TableHeaderCell style={{width: 200}}>계산 기준</TableHeaderCell>
                  <TableHeaderCell style={{width: 130}}>발주 수량</TableHeaderCell>
                  <TableHeaderCell style={{width: 96}}>작업</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.pn}>
                    <TableCell className="sticky-col"><ProductLink pn={r.pn} /></TableCell>
                    <TableCell><BrandBadge brand={r.brand} /></TableCell>
                    <TableCell>{r.name || '-'}</TableCell>
                    <TableCell className="num">{fmt(r.available)}</TableCell>
                    <TableCell className="num">{fmt(r.incoming)}</TableCell>
                    <TableCell className="num muted">{r.calc !== null ? fmt(r.calc) : '-'}</TableCell>
                    <TableCell><span className="scope-cell" title={r.scope || '기준 정보 없음'}>{scopeShort(r.scope)}</span>{r.edited && <> <Badge variant="neutral" label="수량 수정됨" /></>}</TableCell>
                    <TableCell><NumberInput label={`${r.pn} 발주 수량`} isLabelHidden size="sm" min={0} value={r.qty} onChange={v => setCartQty(r.pn, v ?? 0)} /></TableCell>
                    <TableCell>
                      <HStack gap={1}>
                        <IconButton label={`${r.pn} 조회에서 확인`} size="sm" variant="ghost" icon={<Icon icon="search" />} onClick={() => { lookupFor(r.pn, r.qty); lookupSearch(); navigate('lookup'); }} />
                        <IconButton label={`${r.pn} 빼기`} size="sm" variant="ghost" icon={<Icon icon="close" />} onClick={() => removeFromCart(r.pn)} />
                      </HStack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Text type="supporting" className="scroll-hint">표는 옆으로 밀어서 볼 수 있습니다 (품번 열은 고정).</Text>
          <Text type="supporting">발주 수량을 0 으로 하면 목록에서 빠집니다. 파일은 UTF-8(BOM)이라 엑셀에서 한글이 바로 보입니다.</Text>
        </VStack>
      )}
    </PageFrame>
  );
}
