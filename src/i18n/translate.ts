import type { Locale } from '../lib/settings'
import { STRINGS, type StringKey } from './strings'

export type T = (key: StringKey, vars?: Record<string, string | number>) => string

export function translator(locale: Locale): T {
  return (key, vars) => {
    let s = STRINGS[locale][key] ?? STRINGS.en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }
}
