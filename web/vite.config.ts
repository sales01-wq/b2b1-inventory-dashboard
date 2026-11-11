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
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
