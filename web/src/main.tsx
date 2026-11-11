import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
// Astryx 스타일 — 순서 중요: reset → 컴포넌트 → 테마 → 앱 전용
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './styles/global.css';
import {Providers} from './app/Providers';
import {App} from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다.');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
