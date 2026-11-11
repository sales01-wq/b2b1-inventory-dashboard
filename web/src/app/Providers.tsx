import type {ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';

/** 앱 전체 공통 Provider: Astryx 테마 + 한국어 컴포넌트 문구 */
export function Providers({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider locale="ko-KR" messages={{'ko-KR': koKR}}>
      <Theme theme={neutralTheme}>{children}</Theme>
    </InternationalizationProvider>
  );
}
