/// <reference types="vitest/config" />
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 개발 시 /api/* 요청을 기존 Vercel 서버리스 함수로 넘깁니다.
// 저장소 루트에서 `vercel dev` (기본 3000번 포트)를 띄운 뒤 `npm run dev` 를 실행하세요.
// 다른 주소를 쓰려면 API_PROXY_TARGET 환경변수로 지정합니다.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {target: apiTarget, changeOrigin: true},
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 화면 코드는 화면별로 나눴고, 남은 큰 묶음은 Astryx 라이브러리 하나(약 1MB, gzip 약 340kB: AppShell 이 쓰는 움직임 · 제스처 등 내부 모듈).
    // 더 쪼개도 첫 화면에서 모두 필요해서 줄지 않으므로, 그 묶음만 통과하는 한도로 둠. 화면 코드가 커지면 여전히 경고가 남.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // 라이브러리는 화면 코드와 따로 묶어서, 화면만 바뀐 배포에서도 브라우저 캐시를 다시 씀
        manualChunks(id) {
          if (id.includes('node_modules/@astryxdesign/')) return 'astryx';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('node_modules/@heroicons/')) return 'icons';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,js}'],
  },
});
