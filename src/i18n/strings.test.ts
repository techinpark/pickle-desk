import { describe, expect, it } from 'vitest'
import { translator } from './translate'
import { STRINGS } from './strings'

describe('strings', () => {
  it('has the same keys and placeholders in every locale', () => {
    const en = STRINGS.en
    for (const [loc, table] of Object.entries(STRINGS)) {
      expect(Object.keys(table).sort(), loc).toEqual(Object.keys(en).sort())
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
        expect(vars(table[k]), `${loc}.${k}`).toEqual(vars(en[k]))
        expect(table[k].trim(), `${loc}.${k}`).not.toBe('')
      }
    }
  })

  it('interpolates variables', () => {
    expect(translator('ko')('settings.testOk', { n: 3 })).toBe('연결됨 · 작업 3개')
    expect(translator('en')('settings.seconds', { n: 5 })).toBe('5s')
  })
})
