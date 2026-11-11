import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Popover} from '@astryxdesign/core/Popover';
import {VStack} from '@astryxdesign/core/VStack';
import {ArrowPathIcon, FunnelIcon} from '@heroicons/react/16/solid';
import {state, ui} from '../lib/store.js';
import {setTeam, toggleBrand} from '../lib/actions.js';
import {syncStatusText} from '../lib/views.js';
import {shared, refreshFromGoogleSheet} from '../data/shared.js';
import {useStore} from './useStore';
import {DEMO, loadDemoData} from './demo';

const TEAMS = ['전체', 'B2B1팀', 'B2B2팀'];
const BRANDS = ['성분에디터', '밀크터치', '마미케어'];
const ALL_BRANDS = '모든 브랜드'; // 브랜드를 하나도 안 고르면 전체 (기존 규칙) → 그 상태를 눌린 버튼으로 보여줌

/** 기존 머리글의 팀 · 브랜드 선택. vertical: 휴대폰 필터 창 안 */
export function TeamBrandFilters({vertical = false}: {vertical?: boolean}) {
  useStore();
  const Stack = vertical ? VStack : HStack;
  return (
    <Stack gap={3} vAlign={vertical ? undefined : 'center'} wrap={vertical ? undefined : 'wrap'}>
      <SegmentedControl label="팀" size="sm" value={ui.team} onChange={setTeam}>
        {TEAMS.map(t => <SegmentedControlItem key={t} value={t} label={t} />)}
      </SegmentedControl>
      {!vertical && <span className="toolbar-divider" aria-hidden />}
      <ToggleButtonGroup
        label="브랜드"
        type="multiple"
        size="sm"
        value={ui.brandSelected.size === 0 ? [ALL_BRANDS] : BRANDS.filter(b => ui.brandSelected.has(b))}
        onChange={next => {
          const nextSet = new Set(next as string[]);
          // '모든 브랜드'를 누르면 고른 브랜드를 모두 풀고, 브랜드를 누르면 그 브랜드만
          if (ui.brandSelected.size > 0 && nextSet.has(ALL_BRANDS)) { [...ui.brandSelected].forEach(toggleBrand); return; }
          BRANDS.filter(b => nextSet.has(b) !== ui.brandSelected.has(b)).forEach(toggleBrand);
        }}>
        {[ALL_BRANDS, ...BRANDS].map(b => <ToggleButton key={b} value={b} label={b} />)}
      </ToggleButtonGroup>
    </Stack>
  );
}

/** 휴대폰: 팀 · 브랜드를 '필터' 버튼 하나로 (버튼에 지금 고른 값이 보임) */
export function FilterButton() {
  useStore();
  const brands = ui.brandSelected.size === 0 ? ALL_BRANDS : [...ui.brandSelected].join(', ');
  return (
    <Popover label="팀 · 브랜드 필터" width={320} content={<VStack gap={3} padding={3}><TeamBrandFilters vertical /></VStack>}>
      <Button label={`${ui.team} · ${brands}`} size="sm" variant="secondary" icon={<FunnelIcon width={14} height={14} aria-hidden />} />
    </Popover>
  );
}

/** 기존 머리글의 데이터 상태 + 새로고침 버튼 */
export function RefreshStatus() {
  useStore();
  const u = shared.user;
  const refreshLabel = shared.updating ? '업데이트 중...' : u ? (u.isUpdater ? '새로고침 (업데이트)' : '최신 데이터 불러오기') : shared.gsLoading ? '가져오는 중...' : '새로고침';
  const sync = shared.gsLoading && shared.syncText ? shared.syncText : syncStatusText(shared);
  return (
    <HStack gap={3} vAlign="center">
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={state.error ? 'error' : state.lastSync ? 'success' : 'neutral'} label="데이터 상태" />
        <Text type="supporting">{sync}</Text>
      </HStack>
      <Button
        label={refreshLabel}
        size="sm"
        variant="secondary"
        icon={<ArrowPathIcon width={14} height={14} aria-hidden />}
        isLoading={shared.updating || shared.gsLoading}
        onClick={() => (DEMO ? loadDemoData() : refreshFromGoogleSheet(shared.gsUrl))}
      />
    </HStack>
  );
}
