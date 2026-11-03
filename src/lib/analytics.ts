// 방문 통계(GA4). 측정 ID 가 빌드에 들어갔을 때만 켠다(포크한 배포나 테스트에서는 아무것도 보내지 않는다).
// 구글 API 로 받은 정보(이메일, 작업 내용, 시트 주소)는 절대 보내지 않는다 — 이벤트 이름과 고정된 값만 보낸다.

const GA_ID: string = import.meta.env.VITE_GA_ID ?? ''

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
  }
}

let started = false

function start(): Gtag | null {
  if (!GA_ID || typeof window === 'undefined') return null
  if (!started) {
    started = true
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag() {
      // gtag.js 는 arguments 객체 그대로를 기대한다.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', GA_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
    document.head.appendChild(s)
  }
  return window.gtag ?? null
}

/** 주소에서 #access_token 같은 조각과 쿼리를 뺀 위치. */
const cleanLocation = () => window.location.origin + window.location.pathname

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export type AppEvent =
  | { name: 'page_view'; page_title: 'sign_in' | 'setup' | 'onboarding' | 'main' }
  | { name: 'login' }
  | { name: 'sheet_create' }
  | { name: 'task_send'; category: string; source: string }
  | { name: 'prompt_copy'; backfill_days: number }
  | { name: 'onboarding_step'; step: string }
  | { name: 'onboarding_done'; skipped: boolean }
  | { name: 'share'; method: 'clipboard' | 'failed' }

/** 앱 이벤트를 남긴다. 구글 로그인에서 돌아온 직후 주소창의 토큰이 지워진 뒤에만 부른다. */
export function track(e: AppEvent) {
  const gtag = start()
  if (!gtag) return
  const { name, ...params } = e
  gtag('event', name, { ...params, page_location: cleanLocation(), display_mode: standalone() ? 'standalone' : 'browser' })
}
