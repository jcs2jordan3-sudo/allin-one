import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initAuth } from './auth'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

initAuth() // 클라우드 모드: 세션 복원 + 역할 판정 (로컬 모드에서는 no-op)
registerSW({ immediate: true }) // PWA: 새 배포가 있으면 다음 로드에서 자동 갱신

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
