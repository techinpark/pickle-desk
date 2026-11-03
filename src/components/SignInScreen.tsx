import { useI18n } from '../i18n/i18n'
import { CLIENT_ID } from '../lib/google'
import type { SessionError } from '../lib/useSession'
import { PickleMark } from './PickleMark'

interface Props {
  error?: SessionError
  onSignIn: () => void
}

export function SignInScreen({ error, onSignIn }: Props) {
  const { t } = useI18n()
  return (
    <main className="connect">
      <div className="connect-card">
        <div className="connect-icon" aria-hidden="true">
          <PickleMark size={44} />
        </div>
        <h1>{t('login.title')}</h1>
        <p className="connect-body">{t('login.body')}</p>
        <p className="field-help">{t('login.scope')}</p>
        {error && (
          <p className="form-error" role="alert">
            {t(`login.${error}`)}
          </p>
        )}
        {!CLIENT_ID && (
          <p className="form-error" role="alert">
            {t('login.noClient')}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={onSignIn} disabled={!CLIENT_ID} data-testid="login-google">
          {t('login.cta')}
        </button>
        <a className="connect-help" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
          {t('login.privacy')}
        </a>
      </div>
    </main>
  )
}
