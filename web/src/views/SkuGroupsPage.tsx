import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {NoData} from './NoData';
import {ProductLink} from './ProductLink';
import {useStore} from '../app/useStore';
import {ErrorBoundary} from '../app/ErrorBoundary';
import {state} from '../lib/store.js';
import {skuGroupsModel} from '../lib/skugroups.js';
import {canEditSettings, createSkuGroup, updateSkuGroup, deleteSkuGroup, rejectSkuCandidate, clearSkuRejected} from '../data/settings.js';
import {fmt} from '../lib/format';

interface Info {title?: string; pn: string; name: string; barcode: string; lastSale: Date | null; available: number; incoming: number; variant?: string; spec?: string | null; missing?: boolean}
interface Cand {key: string; core: string; variant: string; infos: Info[]; sameBarcode: boolean; sameSpec: boolean; specDiffers: boolean; warnings: string[]; strength: string; rep: {pn: string | null; reason: string}}
interface GroupV {applied: boolean; appliedReason: string; id: string; name: string; members: Info[]; rep: string | null; repManual: boolean; auto: {pn: string | null; reason: string}; compat: Set<string>; warnings: string[]; prevStock: {pn: string; available: number; incoming: number; included: boolean}[]}

let subview: 'cand' | 'group' = 'cand';
const day = (d: Date | null) => (d ? d.toLocaleDateString('ko-KR') : '판매 이력 없음');
const STRENGTH = {'근거 있음': 'green', '이름만 일치': 'yellow', '확인 필요': 'red'} as const;
const BASIS = '최근 판매실적일 기준 (전체 거래처 · 실제 출하일 아님)';

/** 상품 그룹 관리 (1단계): 후보 검토 · 직접 만들기 · 대표 SKU · 재고 호환. 생산 필요 현황 계산에는 아직 반영하지 않음 */
export function SkuGroupsPage() {
  useStore();
  const [, rerender] = useState(0);
  const m = state.loaded ? (skuGroupsModel() as {conflicts: {pn: string; groups: {id: string; name: string}[]}[]; candidates: Cand[]; groups: GroupV[]; rejectedCount: number}) : null;
  return (
    <PageFrame view="skugroups">
      {!m ? <NoData /> : (
        <VStack gap={4}>
          <Card variant="muted"><Text type="supporting">포장 개정 · 고객 전용 SKU 그룹을 검토하고 설정하는 화면입니다. <b>확정한 그룹만 생산 필요 현황에 반영됩니다</b> (한 줄로 합침): 판매 이력은 그룹 전체를 합산하고, 재고 · 입고예정은 대표 SKU 와 호환 확인한 SKU 만 포함합니다. 후보 · 거절 · 그룹 없는 SKU 는 개별 계산 그대로입니다. 이름이 비슷하다는 이유만으로 자동 확정하지 않으며, TARGET · TJX · 일반 SKU 는 서로 묶을 수 없습니다. 이미 담긴 발주 목록 항목은 그룹이 바뀌어도 자동으로 바뀌지 않고 경고만 표시됩니다.</Text></Card>
          {m.conflicts.length > 0 && (
            <Card role="alert">
              <VStack gap={1}>
                <Text type="label" weight="semibold"><span className="text-danger">⚠ SKU 그룹 충돌 {fmt(m.conflicts.length)}건 — 관련 그룹은 계산에서 제외되고 개별 SKU 로 계산됩니다</span></Text>
                {m.conflicts.map(c => <Text key={c.pn} type="supporting"><b>{c.pn}</b> 가 {c.groups.map(g => `'${g.name || g.id}'`).join(', ')} {fmt(c.groups.length)}개 그룹에 속해 있습니다. 한 그룹에서 이 SKU 를 빼거나 그룹을 삭제하면 해결됩니다 (그룹 순서로 자동 결정하지 않음).</Text>)}
              </VStack>
            </Card>
          )}
          <TabList role="tablist" size="sm" hasDivider value={subview} onChange={v => { subview = v as typeof subview; rerender(n => n + 1); }}>
            <Tab value="cand" label={`후보 검토 ${fmt(m.candidates.length)}`} panelId="sku-panel" />
            <Tab value="group" label={`확정 그룹 ${fmt(m.groups.length)}`} panelId="sku-panel" />
          </TabList>
          <div id="sku-panel" role="tabpanel" aria-label={subview === 'cand' ? '후보 검토' : '확정 그룹'}>
            {subview === 'cand' ? <Candidates list={m.candidates} rejected={m.rejectedCount} /> : <Groups list={m.groups} />}
          </div>
        </VStack>
      )}
    </PageFrame>
  );
}

function Errors({list}: {list: string[]}) {
  return list.length === 0 ? null : <div role="alert">{list.map(e => <Text key={e} type="supporting"><span className="text-danger">{e}</span><br /></Text>)}</div>;
}

/* ---------------- 후보 검토 ---------------- */
function Candidates({list, rejected}: {list: Cand[]; rejected: number}) {
  const edit = canEditSettings();
  return (
    <VStack gap={3}>
      {rejected > 0 && edit && <HStack gap={2} vAlign="center"><Text type="supporting">거절한 후보 {fmt(rejected)}개</Text><Button label="거절 모두 되돌리기" size="sm" variant="ghost" onClick={clearSkuRejected} /></HStack>}
      {list.length === 0 ? <Card><EmptyState isCompact headingLevel={3} title="검토할 후보가 없습니다." description="핵심 이름이 같고 고객 전용 종류가 같은 SKU 가 2개 이상 있으면 여기에 나옵니다." /></Card>
        : list.map(c => <ErrorBoundary key={c.key} resetKey={c.key} title="이 후보를 표시하지 못했습니다."><CandidateCard c={c} edit={edit} /></ErrorBoundary>)}
    </VStack>
  );
}

function CandidateCard({c, edit}: {c: Cand; edit: boolean}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(c.infos.map(i => i.pn)));
  const [rep, setRep] = useState<string | null>(null); // null = 자동 제안
  const [name, setName] = useState((c.infos[0].title || c.core) + (c.variant !== '일반' ? ` (${c.variant})` : ''));
  const [errors, setErrors] = useState<string[]>([]);
  const members = c.infos.filter(i => picked.has(i.pn));
  const approve = async () => {
    const r = await createSkuGroup({name, members: members.map(i => i.pn), rep: rep && picked.has(rep) ? rep : null, compat: []});
    setErrors(r.errors || []);
  };
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={3}>{c.core}</Heading>
          <Badge variant={c.variant === '일반' ? 'neutral' : 'blue'} label={c.variant === '일반' ? '일반 시장' : `${c.variant} 전용`} />
          <Badge variant={STRENGTH[c.strength as keyof typeof STRENGTH]} label={c.strength} />
          {c.sameBarcode && <Badge variant="green" label="바코드 같음" />}
          {c.sameSpec && <Badge variant="green" label="마스터 규격 일치" />}
        </HStack>
        {c.warnings.map(w => <Text key={w} type="supporting"><span className="text-warn">⚠ {w}</span></Text>)}
        <MemberTable infos={c.infos} head="포함" cell={i => <CheckboxInput label={`${i.pn} 포함`} isLabelHidden size="sm" value={picked.has(i.pn)} isDisabled={!edit}
          onChange={on => setPicked(p => { const n = new Set(p); if (on) n.add(i.pn); else n.delete(i.pn); return n; })} />}
          role={i => <RepButton i={i} suggested={c.rep.pn} chosen={rep} onPick={setRep} edit={edit} />} />
        <Text type="supporting">대표 SKU: {rep ? <b>{rep} (직접 지정)</b> : c.rep.pn ? <b>{c.rep.pn} (자동 제안 · {c.rep.reason})</b> : <span className="text-warn">{c.rep.reason}</span>}</Text>
        {edit && (
          <HStack gap={2} vAlign="end" wrap="wrap">
            <div className="grow-field"><TextInput label="그룹 이름" size="sm" value={name} onChange={setName} /></div>
            <Button label="승인 (그룹 만들기)" size="sm" variant="primary" isDisabled={members.length < 2} onClick={approve} />
            <Button label="거절" size="sm" variant="secondary" onClick={() => rejectSkuCandidate(c.infos.map(i => i.pn))} />
          </HStack>
        )}
        <Errors list={errors} />
      </VStack>
    </Card>
  );
}

function RepButton({i, suggested, chosen, onPick, edit}: {i: Info; suggested: string | null; chosen: string | null; onPick: (pn: string | null) => void; edit: boolean}) {
  const isRep = chosen ? chosen === i.pn : suggested === i.pn;
  return isRep ? <Badge variant="green" label={chosen ? '대표 (직접)' : '대표 (자동)'} /> : <Button label="대표로 지정" size="sm" variant="ghost" isDisabled={!edit} onClick={() => onPick(i.pn)} />;
}

/** SKU 표 (후보 · 확정 그룹 공통): 품번 · 품명 · 바코드 · 최근 판매실적일 · 재고 · 입고예정 */
function MemberTable({infos, head, cell, role}: {infos: Info[]; head: string; cell: (i: Info) => React.ReactNode; role: (i: Info) => React.ReactNode}) {
  return (
    <Card padding={0}>
      <Table className="sticky-first fixed-cols" density="compact" dividers="rows" style={{tableLayout: 'fixed', minWidth: 760}}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={{width: 56}}>{head}</TableHeaderCell>
            <TableHeaderCell className="sticky-col" style={{width: 110}}>품번</TableHeaderCell>
            <TableHeaderCell style={{width: 220}}>품명</TableHeaderCell>
            <TableHeaderCell style={{width: 130}}>바코드</TableHeaderCell>
            <TableHeaderCell style={{width: 150}}>최근 판매실적일</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: 84}}>가용재고</TableHeaderCell>
            <TableHeaderCell className="num" style={{width: 84}}>입고예정</TableHeaderCell>
            <TableHeaderCell style={{width: 130}}>대표 SKU</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {infos.map(i => (
            <TableRow key={i.pn}>
              <TableCell>{cell(i)}</TableCell>
              <TableCell className="sticky-col">{i.missing ? <code>{i.pn}</code> : <ProductLink pn={i.pn} />}</TableCell>
              <TableCell><span className="pn-wrap">{i.name}</span></TableCell>
              <TableCell>{i.barcode || '-'}</TableCell>
              <TableCell>{i.lastSale ? day(i.lastSale) : <span className="muted">판매 이력 없음</span>}</TableCell>
              <TableCell className="num">{fmt(i.available)}</TableCell>
              <TableCell className="num">{i.incoming ? fmt(i.incoming) : '-'}</TableCell>
              <TableCell>{role(i)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ---------------- 확정 그룹 ---------------- */
function Groups({list}: {list: GroupV[]}) {
  const edit = canEditSettings();
  return (
    <VStack gap={3}>
      {edit && <CreateGroup />}
      {list.length === 0 ? <Card><EmptyState isCompact headingLevel={3} title="확정된 그룹이 없습니다." description="후보를 승인하거나 위에서 직접 만들 수 있습니다." /></Card>
        : list.map(g => <ErrorBoundary key={g.id} resetKey={g.id} title="이 그룹을 표시하지 못했습니다."><GroupCard g={g} edit={edit} /></ErrorBoundary>)}
    </VStack>
  );
}

function CreateGroup() {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const make = async () => {
    const pns = text.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
    const r = await createSkuGroup({name, members: pns, rep: null, compat: []});
    setErrors(r.errors || []);
    if (r.id) { setText(''); setName(''); }
  };
  return (
    <Card>
      <VStack gap={2}>
        <Text type="label" weight="semibold">그룹 직접 만들기</Text>
        <TextArea label="품번 (줄 · 쉼표 · 공백 구분, 엑셀에서 붙여넣기 가능)" size="sm" rows={2} placeholder={'예:\nSB1001\nSB1002'} value={text} onChange={setText} />
        <HStack gap={2} vAlign="end" wrap="wrap">
          <div className="grow-field"><TextInput label="그룹 이름" size="sm" value={name} onChange={setName} /></div>
          <Button label="그룹 만들기" size="sm" variant="primary" isDisabled={!text.trim() || !name.trim()} onClick={make} />
        </HStack>
        <Errors list={errors} />
      </VStack>
    </Card>
  );
}

function GroupCard({g, edit}: {g: GroupV; edit: boolean}) {
  const [name, setName] = useState(g.name);
  const [add, setAdd] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const apply = async (patch: Record<string, unknown>) => { const r = await updateSkuGroup(g.id, patch); setErrors(r.errors || []); return r; };
  const pns = g.members.map(i => i.pn);
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="end" wrap="wrap" hAlign="between">
          <HStack gap={2} vAlign="end" wrap="wrap">
            <div style={{width: 260}}><TextInput label="그룹 이름" size="sm" value={name} isDisabled={!edit} onChange={setName} onKeyDown={e => { if (e.key === 'Enter') apply({name}); }} onBlur={() => { if (name.trim() && name !== g.name) apply({name}); }} /></div>
            {g.applied ? <Badge variant="green" label="생산 필요 현황에 적용 중" /> : <Badge variant="red" label="적용 안 됨" />}
            {g.repManual ? <Badge variant="blue" label={`대표 ${g.rep} (직접 지정)`} /> : g.rep ? <Badge variant="green" label={`대표 ${g.rep} (자동)`} /> : <Badge variant="red" label="대표 SKU 없음" />}
          </HStack>
          {edit && <Button label="그룹 삭제" size="sm" variant="ghost" onClick={() => { if (window.confirm(`'${g.name}' 그룹을 삭제할까요? (SKU 와 판매 이력은 그대로입니다)`)) deleteSkuGroup(g.id); }} />}
        </HStack>
        <Text type="supporting">대표 SKU 자동 판정: {BASIS}. 판매 이력이 없는 새 포장 버전은 직접 지정하세요.</Text>
        {!g.applied && g.appliedReason && <Text type="supporting"><span className="text-warn">⚠ {g.appliedReason}</span></Text>}
        {g.warnings.map(w => <Text key={w} type="supporting"><span className="text-warn">⚠ {w}</span></Text>)}
        <MemberTable infos={g.members} head="호환"
          cell={i => i.pn === g.rep ? <span className="muted">-</span> : <CheckboxInput label={`${i.pn} 재고 호환 확인`} isLabelHidden size="sm" value={g.compat.has(i.pn)} isDisabled={!edit}
            onChange={on => apply({compat: on ? [...g.compat, i.pn] : [...g.compat].filter(p => p !== i.pn)})} />}
          role={i => (
            <HStack gap={1} vAlign="center">
              {i.pn === g.rep ? <Badge variant="green" label={g.repManual ? '대표 (직접)' : '대표 (자동)'} /> : <Button label="대표로 지정" size="sm" variant="ghost" isDisabled={!edit} onClick={() => apply({rep: i.pn})} />}
              {edit && pns.length > 2 && <Button label={`${i.pn} 제외`} size="sm" variant="ghost" onClick={() => apply({members: pns.filter(p => p !== i.pn)})} />}
            </HStack>
          )} />
        <Text type="supporting">호환: 이전 SKU 의 재고 · 입고예정을 대표 SKU 와 바꿔 쓸 수 있다고 직접 확인한 경우에만 체크하면 생산 필요 현황의 가용재고 · 입고예정에 포함됩니다. 체크하지 않은 이전 SKU 의 재고는 계산에 넣지 않고 별도로만 표시합니다. 한 SKU 는 한 번만 계산됩니다.</Text>
        {g.prevStock.length > 0 && (
          <Text type="supporting">이전 SKU 재고 (대표 SKU 와 따로 표시): {g.prevStock.map(p => `${p.pn} 가용 ${fmt(p.available)}${p.incoming ? ` · 입고예정 ${fmt(p.incoming)}` : ''}${p.included ? ' (호환 확인됨)' : ''}`).join(' / ')}</Text>
        )}
        {edit && g.repManual && <HStack><Button label="대표 SKU 자동으로 되돌리기" size="sm" variant="secondary" onClick={() => apply({rep: null})} /></HStack>}
        {edit && (
          <HStack gap={2} vAlign="end" wrap="wrap">
            <div className="grow-field"><TextInput label="멤버 추가 (품번)" size="sm" placeholder="품번 입력 후 추가" value={add} onChange={setAdd} /></div>
            <Button label="멤버 추가" size="sm" variant="secondary" isDisabled={!add.trim()} onClick={async () => { const r = await apply({members: [...pns, add.trim()]}); if (r.id) setAdd(''); }} />
          </HStack>
        )}
        <Errors list={errors} />
      </VStack>
    </Card>
  );
}
