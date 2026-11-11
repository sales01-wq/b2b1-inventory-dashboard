import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {state, ui} from '../lib/store.js';
import {setTeam, toggleBrand} from '../lib/actions.js';
import {syncStatusText} from '../lib/views.js';
import {shared, refreshFromGoogleSheet} from '../data/shared.js';
import {useStore} from './useStore';

const TEAMS = ['전체', 'B2B1팀', 'B2B2팀'];
const BRANDS = ['성분에디터', '밀크터치', '마미케어'];

/** 기존 머리글의 팀 · 브랜드 선택, 새로고침 버튼, 데이터 상태 */
export function GlobalFilters() {
  useStore();
  const u = shared.user;
  const refreshLabel = shared.updating ? '업데이트 중...' : u ? (u.isUpdater ? '🔄 새로고침 (업데이트)' : '🔄 최신 데이터 불러오기') : shared.gsLoading ? '가져오는 중...' : '🔄 새로고침';
  const sync = shared.gsLoading && shared.syncText ? shared.syncText : syncStatusText(shared);
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      <SegmentedControl label="팀" size="sm" value={ui.team} onChange={setTeam}>
        {TEAMS.map(t => <SegmentedControlItem key={t} value={t} label={t} />)}
      </SegmentedControl>
      <ToggleButtonGroup
        label="브랜드"
        type="multiple"
        size="sm"
        value={BRANDS.filter(b => ui.brandSelected.has(b))}
        onChange={next => {
          const nextSet = new Set(next as string[]);
          BRANDS.filter(b => nextSet.has(b) !== ui.brandSelected.has(b)).forEach(toggleBrand);
        }}>
        {BRANDS.map(b => <ToggleButton key={b} value={b} label={b} />)}
      </ToggleButtonGroup>
      <Button
        label={refreshLabel}
        size="sm"
        variant="secondary"
        isLoading={shared.updating || shared.gsLoading}
        onClick={() => refreshFromGoogleSheet(shared.gsUrl)}
      />
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={state.error ? 'error' : state.lastSync ? 'success' : 'neutral'} label="데이터 상태" />
        <Text type="supporting">{sync}</Text>
      </HStack>
    </HStack>
  );
}
