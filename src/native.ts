import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/** 네이티브 앱(Android/iOS 껍데기) 안에서 실행 중인지. 브라우저·PWA면 false. */
export const isNative = Capacitor.isNativePlatform()

/**
 * 네이티브 앱 전용 초기화.
 * - Android 뒤로 가기: 화면 이력이 있으면 뒤로, 첫 화면이면 앱 종료(홈으로).
 * 브라우저에서는 아무것도 하지 않는다.
 */
export function initNative() {
  if (!isNative) return
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.history.length > 1) window.history.back()
    else void App.exitApp()
  })
}
