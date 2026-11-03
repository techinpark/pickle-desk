import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/i18n'
import type { StringKey } from '../i18n/strings'
import { errorKey, GUIDE_URL, parseConnectLink } from '../lib/connection'
import { isScriptUrl, listTasks, type Connection } from '../lib/sheet'
import { Icon } from './Icon'

interface Props {
  /** 저장된 연결이 거부됐을 때 미리 채워 둔다. */
  initial?: Connection | null
  onConnect: (c: Connection) => void
}

export function ConnectScreen({ initial, onConnect }: Props) {
  const { t } = useI18n()
  const [url, setUrl] = useState(initial?.url ?? '')
  const [key, setKey] = useState(initial?.key ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<StringKey | null>(initial ? 'connect.err.key' : null)

  // 연결 링크 전체를 붙여 넣으면 주소와 키를 나눠 채운다.
  const onUrl = (v: string) => {
    const link = parseConnectLink(v.slice(Math.max(0, v.indexOf('#'))))
    if (link) {
      setUrl(link.url)
      setKey(link.key)
    } else setUrl(v)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const c = { url: url.trim(), key: key.trim() }
    if (!isScriptUrl(c.url)) return setError('connect.err.url')
    if (!c.key) return setError('connect.err.key')
    setBusy(true)
    setError(null)
    try {
      await listTasks(c, { limit: 1 })
      onConnect(c)
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="connect">
      <form className="connect-card" onSubmit={submit}>
        <div className="connect-icon" aria-hidden="true">
          <Icon name="tower" size={26} />
        </div>
        <h1>{t('connect.title')}</h1>
        <p className="connect-body">{t('connect.body')}</p>
        <label className="field">
          <span className="field-label">{t('connect.url')}</span>
          <input
            className="input"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="connect-url"
          />
        </label>
        <label className="field">
          <span className="field-label">{t('connect.key')}</span>
          <input
            className="input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            data-testid="connect-key"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} data-testid="connect-submit">
          {busy ? t('connect.checking') : t('connect.cta')}
        </button>
        <a className="connect-help" href={GUIDE_URL} target="_blank" rel="noreferrer">
          {t('connect.guide')}
        </a>
      </form>
    </main>
  )
}
