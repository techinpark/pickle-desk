import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/i18n'
import { requestUrl } from '../lib/feedback'
import { Icon, type IconName } from './Icon'

interface Props {
  sheetUrl: string
  onSettings: () => void
  onPickle: () => void
  onClose: () => void
}

/** ≡ 버튼 메뉴: 설정, 피클 문장, 시트 열기, 개발자에게 업데이트 요청. */
export function MenuSheet({ sheetUrl, onSettings, onPickle, onClose }: Props) {
  const { t, locale } = useI18n()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const item = (icon: IconName, label: string, help?: string) => (
    <>
      <span className="menu-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="menu-text">
        <span className="menu-label">{label}</span>
        {help && <span className="menu-help">{help}</span>}
      </span>
    </>
  )

  return (
    <div className="sheet-backdrop" onClick={onClose} data-testid="menu-sheet">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="menu-title">{t('menu.title')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('settings.close')}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="menu">
          <button type="button" className="menu-item" onClick={onSettings} data-testid="open-settings">
            {item('settings', t('settings.title'))}
          </button>
          <button type="button" className="menu-item" onClick={onPickle}>
            {item('copy', t('settings.pickle'))}
          </button>
          <a className="menu-item" href={sheetUrl} target="_blank" rel="noreferrer" onClick={onClose}>
            {item('sheet', t('pickle.openSheet'))}
          </a>
          <a className="menu-item" href={requestUrl(locale)} target="_blank" rel="noreferrer" onClick={onClose} data-testid="request-update">
            {item('chat', t('menu.request'), t('menu.requestHelp'))}
          </a>
        </nav>
      </div>
    </div>
  )
}
