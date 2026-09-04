import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
