import { useCallback, useEffect, useMemo, useState } from 'react'
import { canTrySilent, completeRedirect, isFresh, loadToken, signOut, startSignIn } from './google'
import { createWorkbook, findWorkbook, SheetError, type Connection, type Workbook } from './sheet'

const WORKBOOK_KEY = 'picklejar.workbook.v1'

export type SessionError = 'denied' | 'expired' | 'failed'

export type Session =
  | { phase: 'loading' }
  | { phase: 'signedOut'; error?: SessionError }
  | { phase: 'noWorkbook'; email: string | null }
  | { phase: 'ready'; email: string | null; workbook: Workbook }

/** 저장된 토큰이 유효하면 그 값을, 아니면 'unauthorized' 를 던진다. 요청마다 불러서 갱신된 토큰을 바로 쓴다. */
export function currentToken(): string {
  const t = loadToken()
  if (!isFresh(t)) throw new SheetError('unauthorized')
  return t.accessToken
}

function loadWorkbook(email: string | null): Workbook | null {
  try {
    const w = JSON.parse(localStorage.getItem(WORKBOOK_KEY) ?? 'null') as (Workbook & { email: string | null }) | null
    return w && w.email === email && w.spreadsheetId ? { spreadsheetId: w.spreadsheetId, url: w.url } : null
  } catch {
    return null
  }
}

function saveWorkbook(w: Workbook | null, email: string | null) {
  if (w) localStorage.setItem(WORKBOOK_KEY, JSON.stringify({ ...w, email }))
  else localStorage.removeItem(WORKBOOK_KEY)
}

/** 만료된 토큰이 있으면 조용히 다시 받으러 간다. 갔으면 true. */
function trySilent(): boolean {
  const old = loadToken()
  if (!old || !canTrySilent()) return false
  startSignIn({ silent: true, hint: old.email })
  return true
}

export function useSession() {
  const [s, setS] = useState<Session>({ phase: 'loading' })
  const [busy, setBusy] = useState(false)

  // 앱을 열 때: 구글에서 돌아왔으면 토큰을 받고 → 토큰이 만료됐으면 조용히 다시 받고 → 작업함을 찾는다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await completeRedirect()
      if (cancelled) return
      const t = loadToken()
      if (!isFresh(t)) {
        if (r.kind === 'error') {
          // 조용한 재로그인이 실패하면(구글 로그아웃 등) 그냥 로그인 화면으로.
          const silent = ['interaction_required', 'login_required', 'consent_required', 'account_selection_required']
          setS({ phase: 'signedOut', error: r.error === 'access_denied' || r.error === 'scope_denied' ? 'denied' : silent.includes(r.error) ? 'expired' : 'failed' })
          return
        }
        if (!trySilent()) setS({ phase: 'signedOut' })
        return
      }
      const saved = loadWorkbook(t.email)
      if (saved) return setS({ phase: 'ready', email: t.email, workbook: saved })
      try {
        const found = await findWorkbook(currentToken)
        if (cancelled) return
        saveWorkbook(found, t.email)
        setS(found ? { phase: 'ready', email: t.email, workbook: found } : { phase: 'noWorkbook', email: t.email })
      } catch {
        if (!cancelled) setS({ phase: 'signedOut', error: 'failed' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(() => startSignIn({ hint: loadToken()?.email }), [])

  /** 시트가 토큰을 거부했을 때: 조용히 다시 받거나, 반복되면 로그인 화면으로. */
  const reauth = useCallback(() => {
    if (!trySilent()) setS({ phase: 'signedOut', error: 'expired' })
  }, [])

  const logout = useCallback(() => {
    saveWorkbook(null, null)
    void signOut()
    setS({ phase: 'signedOut' })
  }, [])

  const create = useCallback(
    async (title: string) => {
      if (s.phase !== 'noWorkbook') return null
      setBusy(true)
      try {
        const w = await createWorkbook(currentToken, title)
        saveWorkbook(w, s.email)
        setS({ phase: 'ready', email: s.email, workbook: w })
        return w
      } catch (e) {
        if (e instanceof SheetError && e.unauthorized) reauth()
        throw e
      } finally {
        setBusy(false)
      }
    },
    [s, reauth],
  )

  /** 작업함 시트가 지워졌을 때: 기억을 지우고 만들기 화면으로. */
  const forgetWorkbook = useCallback(() => {
    if (s.phase !== 'ready') return
    saveWorkbook(null, null)
    setS({ phase: 'noWorkbook', email: s.email })
  }, [s])

  const spreadsheetId = s.phase === 'ready' ? s.workbook.spreadsheetId : null
  const conn = useMemo<Connection | null>(() => (spreadsheetId ? { spreadsheetId, token: currentToken } : null), [spreadsheetId])

  return { session: s, conn, busy, signIn, reauth, logout, create, forgetWorkbook }
}
