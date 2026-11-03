import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/i18n'
import { Icon } from './Icon'
import { PromptCopy } from './PromptCopy'

interface Props {
  sheetUrl: string
  onClose: () => void
}

/** 피클에게 보낼 지시문(시트 링크 포함)을 보여 주고 복사하게 한다. */
export function PickleSheet({ sheetUrl, onClose }: Props) {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose} data-testid="pickle-sheet">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickle-title"
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="pickle-title">{t('pickle.title')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('settings.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <ol className="steps">
            <li>{t('pickle.step1')}</li>
            <li>{t('pickle.step2')}</li>
          </ol>
          <PromptCopy sheetUrl={sheetUrl} />
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            {t('pickle.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
