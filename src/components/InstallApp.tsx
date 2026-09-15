import { useEffect, useState } from 'react'
import { Btn, Modal } from './ui'
import { isNative } from '../native'

// Chrome/Edge(안드로이드·데스크톱)가 주는 설치 프롬프트 이벤트
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = () =>
  isNative ||
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

/**
 * "앱 설치" — PWA를 홈 화면에 추가.
 * 안드로이드/데스크톱 Chrome: 브라우저 설치 프롬프트를 바로 띄움.
 * iOS Safari: 프롬프트 API가 없어 공유 → 홈 화면에 추가 안내를 보여줌.
 * 이미 앱으로 실행 중이면 아무것도 표시하지 않음.
 */
export default function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [guide, setGuide] = useState(false)
  const [standalone, setStandalone] = useState(true)

  useEffect(() => {
    setStandalone(isStandalone())
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setPrompt(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (standalone) return null
  const ios = isIOS()
  if (!prompt && !ios) return null

  const install = async () => {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setPrompt(null)
    } else {
      setGuide(true)
    }
  }

  return (
    <>
      <button onClick={install} className="px-2.5 py-1.5 rounded-lg hover:text-ink hover:bg-surface2 whitespace-nowrap" title="홈 화면에 앱으로 추가">
        📲 앱 설치
      </button>
      <Modal open={guide} onClose={() => setGuide(false)} title="홈 화면에 앱 추가">
        <ol className="list-decimal pl-5 space-y-2 text-[16px] leading-relaxed">
          <li>
            Safari 하단의 <b className="text-ink">공유</b> 버튼(네모에서 화살표가 올라가는 아이콘)을 누릅니다.
          </li>
          <li>
            목록에서 <b className="text-ink">홈 화면에 추가</b>를 선택합니다.
          </li>
          <li>
            오른쪽 위 <b className="text-ink">추가</b>를 누르면 홈 화면에 ALL-IN ONE 아이콘이 생깁니다.
          </li>
        </ol>
        <p className="mt-4 text-[15px] text-mut">Chrome 등 다른 브라우저에서 열었다면 Safari로 다시 열어야 추가할 수 있습니다.</p>
        <div className="mt-5 text-right">
          <Btn variant="primary" onClick={() => setGuide(false)}>확인</Btn>
        </div>
      </Modal>
    </>
  )
}
