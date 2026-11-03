/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 처럼 하위 경로에 올릴 때 BASE_PATH=/pickle-desk/ 로 빌드한다.
const base = process.env.BASE_PATH ?? '/'

// 링크 미리보기(og:url·og:image)는 절대 주소여야 한다. GitHub Actions 에서는 레포 이름으로, 아니면 공식 주소로.
const repo = process.env.GITHUB_REPOSITORY?.split('/')
process.env.VITE_SITE_URL ??= repo ? `https://${repo[0]}.github.io/${repo[1]}/` : 'https://techinpark.github.io/pickle-desk/'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev') },
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pickle Desk',
        short_name: 'Pickle Desk',
        description: 'Hand tasks to Pickle through a Google Sheet and watch replies arrive.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸만 캐시한다. 구글 API 응답은 다른 출처라 항상 네트워크로 받는다.
        // 글꼴은 서브셋 조각이 많아서 미리 받지 않고, 쓰일 때 캐시한다.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 개인정보처리방침은 앱 셸로 바꾸지 않고 그대로 연다.
        navigateFallbackDenylist: [/privacy\.html$/],
        // 알림을 누르면 앱 창을 연다.
        importScripts: ['sw-notify.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 120 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    env: { VITE_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
