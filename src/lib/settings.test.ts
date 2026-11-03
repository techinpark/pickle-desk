import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, KEY, loadSettings, resolveLocale, saveSettings } from './settings'

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips through storage', () => {
    const s = { ...DEFAULT_SETTINGS, pollSeconds: 10, locale: 'ko' as const, theme: 'dark' as const }
    saveSettings(s)
    expect(loadSettings()).toEqual(s)
  })

  it('repairs invalid stored values', () => {
    localStorage.setItem(KEY, JSON.stringify({ pollSeconds: 1, locale: 'fr', theme: 'neon' }))
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('drops unknown keys', () => {
    localStorage.setItem(KEY, JSON.stringify({ token: 'old-secret', tableId: 'x', pollSeconds: 10 }))
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, pollSeconds: 10 })
  })

  it('survives corrupted JSON', () => {
    localStorage.setItem(KEY, '{oops')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('resolves locale from browser languages', () => {
    expect(resolveLocale('auto', ['ko-KR', 'en-US'])).toBe('ko')
    expect(resolveLocale('auto', ['fr-FR', 'en-GB'])).toBe('en')
    expect(resolveLocale('auto', ['ja'])).toBe('en')
    expect(resolveLocale('ko', ['en'])).toBe('ko')
  })
})
