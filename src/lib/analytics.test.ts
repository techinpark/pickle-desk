import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  delete window.gtag
  delete window.dataLayer
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove())
  history.replaceState(null, '', '/')
})

async function load(id: string) {
  vi.stubEnv('VITE_GA_ID', id)
  vi.resetModules()
  return import('./analytics')
}

describe('analytics', () => {
  it('does nothing without a measurement id (forks, tests)', async () => {
    const { track } = await load('')
    track({ name: 'login' })
    expect(window.dataLayer).toBeUndefined()
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('loads gtag once and never sends the URL hash (where the Google token sits)', async () => {
    const { track } = await load('G-TEST123')
    history.replaceState(null, '', '/?x=1#access_token=secret-token')
    track({ name: 'task_send', category: 'idea', source: 'composer' })
    track({ name: 'prompt_copy' })
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1)
    const calls = window.dataLayer!.map((a) => Array.from(a as ArrayLike<unknown>))
    expect(calls.find((c) => c[0] === 'config')).toEqual(['config', 'G-TEST123', expect.objectContaining({ send_page_view: false, allow_google_signals: false })])
    const ev = calls.find((c) => c[0] === 'event' && c[1] === 'task_send')!
    expect(ev[2]).toMatchObject({ category: 'idea', source: 'composer', page_location: `${window.location.origin}/` })
    expect(JSON.stringify(calls)).not.toContain('secret-token')
  })
})
