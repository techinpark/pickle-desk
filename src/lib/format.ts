import type { Locale } from './settings'

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 오늘·어제는 null 대신 'today'·'yesterday' 를 돌려주고, 그 밖에는 현지 날짜 문자열. */
export function dayLabel(iso: string, locale: Locale, now = new Date()): 'today' | 'yesterday' | string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d)
}

export function timeLabel(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

/** 텍스트를 일반 글자와 링크 조각으로 나눈다. http(s) 만 링크로 본다. */
export function splitLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i) })
    out.push({ text: m[0], href: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
