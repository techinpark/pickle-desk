import { useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { track } from '../lib/analytics'
import { BACKFILL_OPTIONS, pickleInstruction, type BackfillDays } from '../lib/pickle'
import { Segmented } from './Segmented'

/** 지난 기록 가져오기 선택 + 피클에게 보낼 문장 + 복사 버튼. 피클 연결 시트와 온보딩이 같이 쓴다. */
export function PromptCopy({ sheetUrl, onCopied }: { sheetUrl: string; onCopied?: () => void }) {
  const { t, locale } = useI18n()
  const [copied, setCopied] = useState(false)
  const [backfill, setBackfill] = useState<BackfillDays>(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const text = pickleInstruction(sheetUrl, backfill, locale)

  const copy = async () => {
    track({ name: 'prompt_copy', backfill_days: backfill })
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 클립보드 권한이 없으면 글을 선택해 두고 사용자가 직접 복사하게 한다.
      area.current?.select()
    }
    setCopied(true)
    onCopied?.()
  }

  return (
    <>
      <div className="field">
        <Segmented
          label={t('pickle.backfill')}
          value={backfill}
          options={BACKFILL_OPTIONS.map((d) => ({ value: d, label: d === 0 ? t('pickle.backfill.none') : t('pickle.backfill.days', { n: d }) }))}
          onChange={(v) => {
            setBackfill(v)
            setCopied(false)
          }}
        />
        <p className="field-help">{t('pickle.backfill.help')}</p>
      </div>
      <textarea ref={area} className="prompt" readOnly value={text} rows={7} data-testid="pickle-prompt" />
      <div className="test-row">
        <button type="button" className="btn btn-weak" onClick={copy} data-testid="copy-prompt">
          {t('pickle.copy')}
        </button>
        <a className="btn btn-weak" href={sheetUrl} target="_blank" rel="noreferrer">
          {t('pickle.openSheet')}
        </a>
        {copied && (
          <span className="test-ok" role="status">
            {t('pickle.copied')}
          </span>
        )}
      </div>
    </>
  )
}
