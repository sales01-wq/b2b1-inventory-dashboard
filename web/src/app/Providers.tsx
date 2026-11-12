import type {ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useMode} from './themeMode';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';

/** 앱 전체 공통 Provider: Astryx 테마 + 한국어 컴포넌트 문구 */
export function Providers({children}: {children: ReactNode}) {
  const mode = useMode();
  return (
    <InternationalizationProvider locale="ko-KR" messages={{'ko-KR': koKR}}>
      <Theme theme={neutralTheme} mode={mode}>{children}</Theme>
    </InternationalizationProvider>
  );
}
