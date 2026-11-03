// 홈 화면 설치. 안드로이드 크롬 등은 beforeinstallprompt 로 설치 창을 띄울 수 있고, 아이폰은 Safari 공유 메뉴로 직접 추가해야 한다.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null

/** 앱 시작 때 한 번 부른다(이벤트가 일찍 와서 화면이 뜨기 전에 잡아 둔다). */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
  })
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export type InstallState = 'installed' | 'prompt' | 'ios' | 'none'

export function installState(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  return isIOS() ? 'ios' : 'none'
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}
