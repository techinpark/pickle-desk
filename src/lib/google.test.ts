import { afterEach, describe, expect, it, vi } from 'vitest'
import { authUrl, canTrySilent, isFresh, parseRedirect, SCOPES } from './google'

afterEach(() => vi.unstubAllEnvs())

const ok = (state: string, scope = SCOPES.join(' ')) =>
  `#access_token=tok&token_type=Bearer&expires_in=3599&state=${state}&scope=${encodeURIComponent(scope)}`

describe('authUrl', () => {
  it('asks for a token by redirect with drive.file only', () => {
    const u = new URL(authUrl({ state: 's1', uri: 'https://example.github.io/pickle-jar/' }))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('response_type')).toBe('token')
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.github.io/pickle-jar/')
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email')
    expect(u.searchParams.get('state')).toBe('s1')
    expect(u.searchParams.get('prompt')).toBe('select_account')
    expect(u.searchParams.has('login_hint')).toBe(false)
  })

  it('uses prompt=none and the remembered account for silent refresh', () => {
    const u = new URL(authUrl({ state: 's', silent: true, hint: 'a@b.c' }))
    expect(u.searchParams.get('prompt')).toBe('none')
    expect(u.searchParams.get('login_hint')).toBe('a@b.c')
  })
})

describe('parseRedirect', () => {
  it('ignores ordinary hashes', () => {
    expect(parseRedirect('', 's')).toEqual({ kind: 'none' })
    expect(parseRedirect('#settings', 's')).toEqual({ kind: 'none' })
  })

  it('accepts a token with the matching state', () => {
    expect(parseRedirect(ok('s'), 's')).toEqual({ kind: 'ok', accessToken: 'tok', expiresIn: 3599 })
  })

  it('rejects a token whose state does not match (forged redirect)', () => {
    expect(parseRedirect(ok('evil'), 's')).toEqual({ kind: 'error', error: 'state_mismatch' })
    expect(parseRedirect(ok('s'), null)).toEqual({ kind: 'error', error: 'state_mismatch' })
  })

  it('reports Google errors and an unchecked Drive permission', () => {
    expect(parseRedirect('#error=access_denied&state=s', 's')).toEqual({ kind: 'error', error: 'access_denied' })
    expect(parseRedirect(ok('s', 'openid email'), 's')).toEqual({ kind: 'error', error: 'scope_denied' })
  })
})

describe('token helpers', () => {
  it('treats tokens about to expire as stale', () => {
    const now = 1_000_000
    expect(isFresh({ accessToken: 't', expiresAt: now + 3_600_000, email: null }, now)).toBe(true)
    expect(isFresh({ accessToken: 't', expiresAt: now + 30_000, email: null }, now)).toBe(false)
    expect(isFresh(null, now)).toBe(false)
  })

  it('does not retry a silent refresh right after one', () => {
    sessionStorage.setItem('picklejar.oauth.silentAt', String(1_000_000))
    expect(canTrySilent(1_010_000)).toBe(false)
    expect(canTrySilent(1_000_000 + 61_000)).toBe(true)
    sessionStorage.clear()
  })
})
