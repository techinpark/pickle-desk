// Google 로그인. 서버가 없어서 OAuth "클라이언트 측 웹 앱" 흐름(response_type=token)을 리디렉트로 쓴다.
// 팝업은 iOS 홈 화면 앱(standalone)에서 돌아오지 못해서 쓰지 않는다.
// 액세스 토큰은 1시간짜리라, 만료되면 prompt=none 으로 조용히 다시 받아 온다(이미 동의한 계정이면 클릭 없음).

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
// drive.file: 이 앱이 만든 파일에만 접근한다(구글 분류상 민감하지 않은 권한). openid·email: 설정에 계정을 보여 주려고.
export const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']

const TOKEN_KEY = 'pickledesk.token.v1'
const STATE_KEY = 'pickledesk.oauth.state'
const SILENT_KEY = 'pickledesk.oauth.silentAt'
/** 만료 직전 토큰으로 요청하다 실패하지 않게 여유를 둔다. */
const EXPIRY_MARGIN_MS = 60_000
/** 조용한 재로그인이 이 시간 안에 또 필요하면(실패 반복) 로그인 화면을 보여 준다. */
const SILENT_RETRY_MS = 60_000

export interface Token {
  accessToken: string
  expiresAt: number
  email: string | null
}

export function redirectUri(loc: Pick<Location, 'origin'> = window.location): string {
  return loc.origin + import.meta.env.BASE_URL
}

export function loadToken(storage: Storage = localStorage): Token | null {
  try {
    const t = JSON.parse(storage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && typeof t.accessToken === 'string' && typeof t.expiresAt === 'number' ? t : null
  } catch {
    return null
  }
}

export function saveToken(t: Token | null, storage: Storage = localStorage) {
  if (t) storage.setItem(TOKEN_KEY, JSON.stringify(t))
  else storage.removeItem(TOKEN_KEY)
}

export const isFresh = (t: Token | null, now = Date.now()): t is Token => !!t && t.expiresAt - EXPIRY_MARGIN_MS > now

export function authUrl(opts: { state: string; silent?: boolean; hint?: string | null; uri?: string }): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: opts.uri ?? redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state: opts.state,
    prompt: opts.silent ? 'none' : 'select_account',
  })
  if (opts.hint) p.set('login_hint', opts.hint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

/** 페이지 이동. 테스트에서 바꿔 끼운다(jsdom 은 이동을 못 한다). */
export const nav = { go: (url: string) => window.location.assign(url) }

/** 구글 로그인 페이지로 보낸다. silent 면 화면 없이 돌아오기를 시도한다. */
export function startSignIn(opts: { silent?: boolean; hint?: string | null } = {}) {
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)
  if (opts.silent) sessionStorage.setItem(SILENT_KEY, String(Date.now()))
  nav.go(authUrl({ state, ...opts }))
}

/** 조용한 재로그인을 해도 되는지. 방금 시도했다가 다시 온 거면 반복하지 않는다. */
export function canTrySilent(now = Date.now()): boolean {
  return now - Number(sessionStorage.getItem(SILENT_KEY) ?? 0) > SILENT_RETRY_MS
}

export type RedirectResult = { kind: 'none' } | { kind: 'ok'; accessToken: string; expiresIn: number } | { kind: 'error'; error: string }

/** 구글에서 돌아온 주소(#access_token=…)를 읽는다. state 가 다르면 버린다(다른 곳에서 꾸민 응답). */
export function parseRedirect(hash: string, expectedState: string | null): RedirectResult {
  if (!hash.startsWith('#')) return { kind: 'none' }
  const p = new URLSearchParams(hash.slice(1))
  if (!p.has('access_token') && !p.has('error')) return { kind: 'none' }
  if (!expectedState || p.get('state') !== expectedState) return { kind: 'error', error: 'state_mismatch' }
  const err = p.get('error')
  if (err) return { kind: 'error', error: err }
  const granted = (p.get('scope') ?? '').split(' ')
  if (!granted.includes(SCOPES[0])) return { kind: 'error', error: 'scope_denied' }
  return { kind: 'ok', accessToken: p.get('access_token')!, expiresIn: Number(p.get('expires_in') ?? 3600) }
}

let pending: Promise<RedirectResult> | null = null

/**
 * 앱이 열릴 때 부른다. 돌아온 토큰을 저장하고 주소창에서 지운다.
 * 주소창을 읽는 즉시 지우므로, 두 번 불려도(StrictMode 의 effect 재실행 등) 첫 호출의 결과를 같이 기다린다.
 */
export function completeRedirect(): Promise<RedirectResult> {
  pending ??= consumeRedirect().finally(() => {
    pending = null
  })
  return pending
}

async function consumeRedirect(): Promise<RedirectResult> {
  const r = parseRedirect(window.location.hash, sessionStorage.getItem(STATE_KEY))
  if (r.kind === 'none') return r
  sessionStorage.removeItem(STATE_KEY)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (r.kind === 'ok') {
    sessionStorage.removeItem(SILENT_KEY)
    const email = await fetchEmail(r.accessToken).catch(() => loadToken()?.email ?? null)
    saveToken({ accessToken: r.accessToken, expiresAt: Date.now() + r.expiresIn * 1000, email })
  }
  return r
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  return ((await res.json()) as { email?: string }).email ?? null
}

/** 로그아웃: 토큰을 구글에 돌려주고(실패해도 무시) 지운다. */
export async function signOut() {
  const t = loadToken()
  saveToken(null)
  if (t) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.accessToken)}`, { method: 'POST' }).catch(() => {})
  }
}
