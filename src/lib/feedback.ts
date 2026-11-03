// 메뉴의 "업데이트 요청하기": GitHub 이슈 양식(.github/ISSUE_TEMPLATE/request.yml)을 앱 정보가 채워진 채로 연다.
// 앱 정보에는 버전·기기 종류만 넣는다(이메일·시트 주소·작업 내용은 넣지 않는다).

export const REPO_URL = 'https://github.com/techinpark/pickle-desk'

function device(ua = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  return 'other'
}

export function appInfo(): string {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return `v ${__APP_VERSION__} · ${device()} · ${standalone ? 'home screen app' : 'browser'}`
}

export function requestUrl(): string {
  const q = new URLSearchParams({ template: 'request.yml', env: appInfo() })
  return `${REPO_URL}/issues/new?${q}`
}
