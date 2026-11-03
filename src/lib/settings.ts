export type Locale = 'en' | 'ko'
export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  pollSeconds: number
  locale: Locale | 'auto'
  theme: ThemePref
  /** 앱이 백그라운드에 있을 때 새 답변 알림 */
  notify: boolean
}

export const POLL_OPTIONS = [5, 10, 15, 30] as const
export const KEY = 'pickledesk.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  pollSeconds: 5,
  locale: 'auto',
  theme: 'system',
  notify: false,
}

export function loadSettings(storage: Storage = localStorage): Settings {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}') as Partial<Settings>
    // 아는 키만 남긴다.
    const s: Settings = {
      pollSeconds: raw.pollSeconds ?? DEFAULT_SETTINGS.pollSeconds,
      locale: raw.locale ?? DEFAULT_SETTINGS.locale,
      theme: raw.theme ?? DEFAULT_SETTINGS.theme,
      notify: raw.notify === true,
    }
    if (!(POLL_OPTIONS as readonly number[]).includes(s.pollSeconds)) s.pollSeconds = DEFAULT_SETTINGS.pollSeconds
    if (!['auto', 'en', 'ko'].includes(s.locale)) s.locale = 'auto'
    if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system'
    return s
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings, storage: Storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(s))
}

export function resolveLocale(pref: Settings['locale'], languages: readonly string[] = navigator.languages ?? []): Locale {
  if (pref !== 'auto') return pref
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0]
    if (base === 'ko' || base === 'en') return base
  }
  return 'en'
}
