import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

// 빌드 결과(vite preview)를 데스크톱·모바일 크기로 돈다. 구글 API 는 테스트 안에서 가짜 응답으로 바꾼다(실데이터를 건드리지 않음).
// E2E_URL 을 주면 배포된 주소를 그대로 연다.
const app = process.env.E2E_URL
  ? { url: process.env.E2E_URL }
  : {
      url: 'http://localhost:4173',
      command: { executable: 'npx', args: ['vite', 'preview', '--port', '4173', '--strictPort'], log: '.e2e/logs/app.log' },
    }

export default {
  tests: 'tests/**/*.e2e.ts',
  targets: [
    { name: 'desktop', engine: web({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' }), app },
    { name: 'mobile', engine: web({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' }), app },
  ],
  workers: 2,
} satisfies E2EConfig
