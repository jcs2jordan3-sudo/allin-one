import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA — 폰 홈 화면에 설치되는 앱. 앱 셸(정적 파일)만 캐시하고 Supabase API는 항상 네트워크.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'ALL-IN ONE 홀덤펍 매니저',
        short_name: 'ALL-IN ONE',
        description: '홀덤펍 매장 운영 콘솔 — 게임·좌석·포인트·랭킹',
        lang: 'ko',
        display: 'standalone',
        orientation: 'any',
        background_color: '#07090e',
        theme_color: '#07090e',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Pretendard 폰트 CSS·파일 — 한 번 받으면 오프라인에서도 같은 글꼴
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'cdn-fonts', expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            // Supabase: 캐시 금지 (실시간 데이터)
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { port: 5175 },
  build: {
    rollupOptions: {
      output: {
        // 벤더를 분리해 앱 코드 변경 시 캐시가 유지되도록 함
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          qr: ['qrcode.react'],
        },
      },
    },
  },
})
