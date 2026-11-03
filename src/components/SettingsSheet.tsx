import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { errorKey } from '../lib/connection'
import { listTasks, type Connection } from '../lib/sheet'
import { POLL_OPTIONS, type Settings } from '../lib/settings'
import { Icon } from './Icon'
import { Segmented } from './Segmented'

interface Props {
  settings: Settings
  conn: Connection
  onSave: (s: Settings) => void
  onDisconnect: () => void
  onClose: () => void
}

type TestState = { kind: 'idle' } | { kind: 'running' } | { kind: 'ok'; n: number } | { kind: 'fail'; msg: string }

export function SettingsSheet({ settings, conn, onSave, onDisconnect, onClose }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(settings)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const runTest = async () => {
    setTest({ kind: 'running' })
    try {
      const page = await listTasks(conn, { limit: 1 })
      setTest({ kind: 'ok', n: page.total })
    } catch (e) {
      setTest({ kind: 'fail', msg: t(errorKey(e)) })
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} data-testid="settings-sheet">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="settings-title">{t('settings.title')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('settings.close')}>
            <Icon name="close" />
          </button>
        </div>

        <div className="sheet-body">
          <section className="group">
            <h3>{t('settings.connection')}</h3>
            <div className="endpoint" data-testid="account">
              {conn.url}
            </div>
            <div className="test-row">
              <button type="button" className="btn btn-weak" onClick={runTest} disabled={test.kind === 'running'}>
                {t('settings.test')}
              </button>
              {test.kind === 'ok' && <span className="test-ok">{t('settings.testOk', { n: test.n })}</span>}
              {test.kind === 'fail' && <span className="test-fail">{t('settings.testFail', { msg: test.msg })}</span>}
            </div>
          </section>

          <section className="group">
            <Segmented
              label={t('settings.poll')}
              value={draft.pollSeconds}
              options={POLL_OPTIONS.map((n) => ({ value: n, label: t('settings.seconds', { n }) }))}
              onChange={(v) => set('pollSeconds', v)}
            />
            <Segmented
              label={t('settings.language')}
              value={draft.locale}
              options={[
                { value: 'auto', label: t('settings.lang.auto') },
                { value: 'ko', label: '한국어' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(v) => set('locale', v)}
            />
            <Segmented
              label={t('settings.theme')}
              value={draft.theme}
              options={[
                { value: 'system', label: t('settings.theme.system') },
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
              ]}
              onChange={(v) => set('theme', v)}
            />
          </section>

          <button type="button" className="text-danger" onClick={onDisconnect}>
            {t('settings.signOut')}
          </button>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => onSave(draft)} data-testid="save-settings">
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
