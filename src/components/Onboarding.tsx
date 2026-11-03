import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { track } from '../lib/analytics'
import { installState, promptInstall, type InstallState } from '../lib/install'
import { notifySupport, requestNotify } from '../lib/notify'
import { STEPS, type Step } from '../lib/onboarding'
import type { Settings } from '../lib/settings'
import type { Task } from '../lib/types'
import { Icon } from './Icon'
import { PickleMark } from './PickleMark'
import { PromptCopy } from './PromptCopy'

interface Props {
  step: Step
  email: string | null
  busy: boolean
  sheetUrl: string | null
  tasks: Task[]
  testId?: number
  settings: Settings
  onCreate: (title: string) => Promise<unknown>
  onStep: (step: Step) => void
  onSendTest: (text: string) => Promise<number | null>
  onSettings: (s: Settings) => void
  onFinish: (skipped: boolean) => void
  onSignOut: () => void
}

/** 처음 로그인한 사람을 위한 단계별 설정: 작업함 → 피클 구글 연동 → 문장 보내기 → 연결 확인 → 알림·홈 화면. */
export function Onboarding(p: Props) {
  const { t } = useI18n()
  const index = STEPS.indexOf(p.step)
  const go = (s: Step) => {
    track({ name: 'onboarding_step', step: s })
    p.onStep(s)
  }

  return (
    <main className="onb" data-testid="onboarding" data-step={p.step}>
      <div className="onb-top">
        {index > 1 ? (
          <button type="button" className="icon-btn" onClick={() => go(STEPS[index - 1])} aria-label={t('onb.back')}>
            <Icon name="arrowLeft" />
          </button>
        ) : (
          <span className="icon-btn-spacer" aria-hidden="true" />
        )}
        <div className="onb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1} aria-label={t('onb.progress', { n: index + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <i key={s} className={i <= index ? 'on' : ''} />
          ))}
        </div>
        {index > 0 ? (
          <button type="button" className="onb-skip" onClick={() => p.onFinish(true)}>
            {t('onb.later')}
          </button>
        ) : (
          <span className="icon-btn-spacer" aria-hidden="true" />
        )}
      </div>

      <div className="onb-body">
        {p.step === 'create' && <CreateStep {...p} onDone={() => go('google')} />}
        {p.step === 'google' && <GoogleStep onDone={() => go('prompt')} />}
        {p.step === 'prompt' && p.sheetUrl && <PromptStep sheetUrl={p.sheetUrl} onDone={() => go('test')} />}
        {p.step === 'test' && <TestStep {...p} onDone={() => go('finish')} />}
        {p.step === 'finish' && <FinishStep settings={p.settings} onSettings={p.onSettings} onDone={() => p.onFinish(false)} />}
      </div>
    </main>
  )
}

function Hero({ title, body, mark = true }: { title: string; body: string; mark?: boolean }) {
  return (
    <>
      {mark && (
        <div className="connect-icon" aria-hidden="true">
          <PickleMark size={44} />
        </div>
      )}
      <h1 className="onb-title">{title}</h1>
      <p className="connect-body">{body}</p>
    </>
  )
}

function CreateStep({ email, busy, onCreate, onSignOut, onDone }: Props & { onDone: () => void }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const create = async () => {
    setFailed(false)
    try {
      await onCreate(t('setup.sheetTitle'))
      onDone()
    } catch {
      setFailed(true)
    }
  }
  return (
    <>
      <Hero title={t('setup.title')} body={t('setup.body')} />
      {email && <p className="field-help">{email}</p>}
      {failed && (
        <p className="form-error" role="alert">
          {t('setup.failed')}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={create} disabled={busy} data-testid="create-sheet">
          {busy ? t('setup.creating') : t('setup.cta')}
        </button>
        <button type="button" className="connect-help" onClick={onSignOut}>
          {t('settings.signOut')}
        </button>
      </div>
    </>
  )
}

function GoogleStep({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const phrase = t('onb.google.phrase')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
    } catch {
      // 복사가 안 되면 화면의 문장을 보고 직접 말하면 된다.
    }
  }
  return (
    <>
      <Hero title={t('onb.google.title')} body={t('onb.google.body')} />
      {help && (
        <div className="onb-help" role="region" aria-label={t('onb.google.howTitle')}>
          <p className="onb-help-title">{t('onb.google.howTitle')}</p>
          <button type="button" className="onb-phrase" onClick={copy} data-testid="google-phrase">
            “{phrase}”
            <span className="onb-phrase-copy">
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? t('timeline.copied') : t('timeline.copy')}
            </span>
          </button>
          <p className="field-help">{t('onb.google.howBody')}</p>
        </div>
      )}
      <div className="onb-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onDone} data-testid="google-yes">
          {help ? t('onb.google.done') : t('onb.google.yes')}
        </button>
        {!help && (
          <button type="button" className="btn btn-weak btn-block" onClick={() => setHelp(true)} data-testid="google-no">
            {t('onb.google.no')}
          </button>
        )}
      </div>
    </>
  )
}

function PromptStep({ sheetUrl, onDone }: { sheetUrl: string; onDone: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <>
      <Hero title={t('onb.prompt.title')} body={t('onb.prompt.body')} mark={false} />
      <PromptCopy sheetUrl={sheetUrl} onCopied={() => setCopied(true)} />
      <div className="onb-actions">
        <button type="button" className={`btn btn-block ${copied ? 'btn-primary' : 'btn-weak'}`} onClick={onDone} data-testid="prompt-sent">
          {copied ? t('onb.prompt.sent') : t('onb.prompt.skipCopy')}
        </button>
      </div>
    </>
  )
}

function TestStep({ tasks, testId, onSendTest, onDone }: Props & { onDone: () => void }) {
  const { t } = useI18n()
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const test = testId != null ? tasks.find((x) => x.id === testId) : undefined
  const answered = !!test && (test.reply.trim() !== '' || test.status === 'done' || test.status === 'failed')

  useEffect(() => {
    if (answered) track({ name: 'onboarding_step', step: 'test_ok' })
  }, [answered])

  const send = async () => {
    setSending(true)
    setFailed(false)
    const id = await onSendTest(t('onb.test.task'))
    setSending(false)
    if (id == null) setFailed(true)
  }

  if (answered) {
    return (
      <>
        <Hero title={t('onb.test.okTitle')} body={t('onb.test.okBody')} />
        {test.reply && <div className="bubble onb-reply">{test.reply}</div>}
        <div className="onb-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={onDone} data-testid="test-next">
            {t('onb.next')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <Hero title={t('onb.test.title')} body={t(testId != null ? 'onb.test.waitingBody' : 'onb.test.body')} />
      {testId != null && (
        <div className="bubble bubble-waiting onb-wait" aria-live="polite" data-testid="test-waiting">
          <span className="typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {t(test?.status === 'running' ? 'timeline.working' : 'onb.test.waiting')}
        </div>
      )}
      {failed && (
        <p className="form-error" role="alert">
          {t('composer.failed')}
        </p>
      )}
      <div className="onb-actions">
        {testId == null ? (
          <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending} data-testid="send-test">
            {t('onb.test.send')}
          </button>
        ) : null}
        <button type="button" className="btn btn-weak btn-block" onClick={onDone} data-testid="test-skip">
          {t(testId == null ? 'onb.test.skip' : 'onb.test.dontWait')}
        </button>
      </div>
    </>
  )
}

function FinishStep({ settings, onSettings, onDone }: { settings: Settings; onSettings: (s: Settings) => void; onDone: () => void }) {
  const { t } = useI18n()
  const [install, setInstall] = useState<InstallState>(() => installState())
  const [note, setNote] = useState<string | null>(null)
  const support = notifySupport()

  const notifyOn = async () => {
    setNote(null)
    if (support !== 'ok') return setNote(t(`settings.notify.${support}`))
    if (await requestNotify()) onSettings({ ...settings, notify: true })
    else setNote(t('settings.notify.denied'))
  }

  return (
    <>
      <Hero title={t('onb.finish.title')} body={t('onb.finish.body')} />
      <div className="onb-list">
        <div className="onb-item">
          <span className="menu-icon" aria-hidden="true">
            <Icon name="bell" size={20} />
          </span>
          <div className="menu-text">
            <span className="menu-label">{t('settings.notify')}</span>
            <span className="menu-help">{note ?? t('onb.finish.notifyHelp')}</span>
          </div>
          {settings.notify ? (
            <span className="test-ok">{t('onb.finish.on')}</span>
          ) : (
            <button type="button" className="btn btn-weak onb-item-btn" onClick={notifyOn} data-testid="onb-notify">
              {t('settings.notify.on')}
            </button>
          )}
        </div>
        {install !== 'none' && (
          <div className="onb-item">
            <span className="menu-icon" aria-hidden="true">
              <Icon name="download" size={20} />
            </span>
            <div className="menu-text">
              <span className="menu-label">{t('onb.finish.install')}</span>
              <span className="menu-help">
                {install === 'installed' ? t('onb.finish.installed') : install === 'ios' ? t('onb.finish.iosHow') : t('onb.finish.installHelp')}
              </span>
            </div>
            {install === 'prompt' && (
              <button
                type="button"
                className="btn btn-weak onb-item-btn"
                onClick={async () => {
                  await promptInstall()
                  setInstall(installState())
                }}
              >
                {t('onb.finish.installBtn')}
              </button>
            )}
            {install === 'installed' && <span className="test-ok">{t('onb.finish.on')}</span>}
          </div>
        )}
      </div>
      <div className="onb-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onDone} data-testid="onb-start">
          {t('onb.finish.start')}
        </button>
      </div>
    </>
  )
}
