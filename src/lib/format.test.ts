import { describe, expect, it } from 'vitest'
import { dayKey, dayLabel, splitLinks } from './format'

describe('format', () => {
  const now = new Date(2026, 9, 28, 15, 0)
  it('labels today and yesterday', () => {
    expect(dayLabel(new Date(2026, 9, 28, 0, 5).toISOString(), 'ko', now)).toBe('today')
    expect(dayLabel(new Date(2026, 9, 27, 23, 59).toISOString(), 'en', now)).toBe('yesterday')
  })
  it('formats older days in the locale', () => {
    expect(dayLabel(new Date(2026, 9, 20).toISOString(), 'ko', now)).toContain('10월 20일')
    expect(dayLabel(new Date(2025, 0, 2).toISOString(), 'en', now)).toContain('2025')
  })
  it('groups by local day', () => {
    expect(dayKey(new Date(2026, 9, 28, 1).toISOString())).toBe(dayKey(new Date(2026, 9, 28, 23).toISOString()))
  })
  it('splits http links only', () => {
    expect(splitLinks('see https://a.com/x?y=1 and javascript:alert(1)')).toEqual([
      { text: 'see ' },
      { text: 'https://a.com/x?y=1', href: 'https://a.com/x?y=1' },
      { text: ' and javascript:alert(1)' },
    ])
    expect(splitLinks('plain')).toEqual([{ text: 'plain' }])
    expect(splitLinks('(https://b.kr)')).toEqual([{ text: '(' }, { text: 'https://b.kr', href: 'https://b.kr' }, { text: ')' }])
  })
})
