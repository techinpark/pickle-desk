// 메뉴의 "업데이트 요청하기": 구글 폼(로그인 없이 제출 가능)을 앱 정보가 채워진 채로 연다.
// 앱 정보에는 버전·기기 종류만 넣는다(이메일·시트 주소·작업 내용은 넣지 않는다).
// 포크해서 쓰는 경우 VITE_FEEDBACK_FORM_URL(미리 채운 링크의 viewform 주소)과 VITE_FEEDBACK_ENTRY(entry.숫자)로 바꾼다.

const FORM_URL: string =
  import.meta.env.VITE_FEEDBACK_FORM_URL ??
  'https://docs.google.com/forms/d/e/1FAIpQLSeV0WwoDswhMwR5_SYqMLXfRNMURTOo4xUFRA1I_xr2iVrrVA/viewform'
const ENTRY: string = import.meta.env.VITE_FEEDBACK_ENTRY ?? 'entry.1757267059'

function device(ua = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  return 'other'
}

export function appInfo(locale: string): string {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return `v ${__APP_VERSION__} · ${device()} · ${standalone ? 'home screen app' : 'browser'} · ${locale}`
}

export function requestUrl(locale: string): string {
  const q = new URLSearchParams({ usp: 'pp_url', [ENTRY]: appInfo(locale) })
  return `${FORM_URL}?${q}`
}
