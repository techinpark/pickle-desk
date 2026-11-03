import { useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { PickleMark } from './PickleMark'

interface Props {
  email: string | null
  busy: boolean
  onCreate: (title: string) => Promise<unknown>
  onSignOut: () => void
}

export function SetupScreen({ email, busy, onCreate, onSignOut }: Props) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const create = async () => {
    setFailed(false)
    try {
      await onCreate(t('setup.sheetTitle'))
    } catch {
      setFailed(true)
    }
  }
  return (
    <main className="connect">
      <div className="connect-card">
        <div className="connect-icon" aria-hidden="true">
          <PickleMark size={44} />
        </div>
        <h1>{t('setup.title')}</h1>
        <p className="connect-body">{t('setup.body')}</p>
        {email && <p className="field-help">{email}</p>}
        {failed && (
          <p className="form-error" role="alert">
            {t('setup.failed')}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={create} disabled={busy} data-testid="create-sheet">
          {busy ? t('setup.creating') : t('setup.cta')}
        </button>
        <button type="button" className="connect-help" onClick={onSignOut}>
          {t('settings.signOut')}
        </button>
      </div>
    </main>
  )
}
