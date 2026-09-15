import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 네이티브 앱(Capacitor) 설정.
 * - 웹 번들(dist, base '/')을 앱 안에 담아 배포한다: `npm run native:build` → `npm run native:sync`.
 * - 개발 중 실서버(GitHub Pages) 화면을 앱 껍데기로 그대로 띄우려면 CAP_SERVER_URL을 주고 sync 한다.
 *   (예: PowerShell  $env:CAP_SERVER_URL='https://jcs2jordan3-sudo.github.io/allin-one/'; npx cap sync android)
 */
const serverUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.allinone.holdem',
  appName: 'ALL-IN ONE',
  webDir: 'dist',
  backgroundColor: '#07090e',
  plugins: {
    // 시스템 바(상태바·내비바): 웹뷰를 화면 끝까지 펼치고 env(safe-area-inset-*)로 여백을 준다 (index.html viewport-fit=cover)
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'DARK' },
  },
  ...(serverUrl ? { server: { url: serverUrl, cleartext: false } } : {}),
}

export default config
