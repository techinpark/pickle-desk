import { createContext, useContext, type ReactNode } from 'react'
import type { Locale } from '../lib/settings'
import { translator, type T } from './translate'

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: 'en', t: translator('en') })

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={{ locale, t: translator(locale) }}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
