import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { Icon } from './components/Icon'
import { MenuSheet } from './components/MenuSheet'
import { PickleSheet } from './components/PickleSheet'
import { SettingsSheet } from './components/SettingsSheet'
import { Onboarding } from './components/Onboarding'
import { SignInScreen } from './components/SignInScreen'
import { Timeline } from './components/Timeline'
import { I18nProvider } from './i18n/i18n'
import { translator } from './i18n/translate'
import { track } from './lib/analytics'
import { uploadImage, withImageLinks } from './lib/attach'
import { DriveToken } from './lib/driveToken'
import { NOTIFY_BATCH, showSummaryNotification, showTaskNotification, worthNotifying } from './lib/notify'
import { loadSettings, resolveLocale, saveSettings, type Settings } from './lib/settings'
import { loadOnboarding, saveOnboarding, type Onboarding as OnboardingState, type Step } from './lib/onboarding'
import { STATUSES, type Category, type Status, type Task, type TaskSource } from './lib/types'
import { useSession } from './lib/useSession'
import { changedIds, useTasks } from './lib/useTasks'

const NEAR_BOTTOM = 160

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - NEAR_BOTTOM
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const locale = resolveLocale(settings.locale)
  const t = useMemo(() => translator(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('appName')
  }, [locale, t])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  const update = useCallback((s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }, [])

  const { session, conn, busy, signIn, reauth, logout, create, forgetWorkbook } = useSession()
  const tasks = useTasks(conn, settings.pollSeconds, settings.notify)

  // 토큰이 만료되면 조용히 다시 받아 온다(이미 동의한 계정이면 구글 화면을 잠깐 거쳐 바로 돌아옴).
  useEffect(() => {
    if (tasks.state === 'unauthorized') reauth()
  }, [tasks.state, reauth])

  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [sheet, setSheet] = useState(false)
  const [pickle, setPickle] = useState(false)
  const [menu, setMenu] = useState(false)
  // 처음 설정(온보딩). 새로 만든 작업함에만 한다.
  const [onb, setOnb] = useState<OnboardingState | null>(() => loadOnboarding())
  useEffect(() => saveOnboarding(onb), [onb])
  const inOnboarding = session.phase === 'ready' && onb?.sheetId === session.workbook.spreadsheetId
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set())
  const [showJump, setShowJump] = useState(false)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  // 피클이 상태·답변을 바꾼 카드를 잠깐 강조한다.
  const prevRef = useRef<Map<number, Task>>(new Map())
  const notifyOn = useRef(settings.notify)
  useEffect(() => {
    notifyOn.current = settings.notify
  }, [settings.notify])
  useEffect(() => {
    const prev = prevRef.current
    const ids = changedIds(prev, tasks.tasks)
    prevRef.current = new Map(tasks.tasks.map((x) => [x.id, x]))
    // 앱이 가려져 있는 동안 피클이 답하면 알린다. 처음 불러온 목록(prev 가 빈 경우)은 알리지 않는다.
    if (notifyOn.current && prev.size > 0 && document.visibilityState !== 'visible') {
      const news = tasks.tasks.filter((x) => worthNotifying(prev.get(x.id), x))
      if (news.length > NOTIFY_BATCH) void showSummaryNotification(t('timeline.agent'), t('notify.many', { n: news.length }))
      else for (const x of news) void showTaskNotification(x, t('timeline.agent'), t(`status.${x.status}`))
    }
    if (ids.length === 0) return
    setFreshIds(new Set(ids))
    const id = window.setTimeout(() => setFreshIds(new Set()), 2400)
    return () => window.clearTimeout(id)
  }, [tasks.tasks, t])

  // 스크롤 따라가기. 아래 근처에 있었는지는 새 내용이 그려지기 "전" 값을 써야 해서 스크롤할 때마다 기억해 둔다.
  // (그린 뒤에 재면 긴 답변이 붙는 순간 아래에서 멀어진 것으로 보여 따라가지 못한다.)
  const atBottom = useRef(true)
  const scrolledOnce = useRef(false)
  const olderAnchor = useRef<number | null>(null) // 이전 작업을 불러올 때 아래에서부터 떨어진 거리
  // 새 연결이거나 온보딩을 마치고 타임라인이 처음 보일 때 최신으로 내려간다.
  useEffect(() => {
    scrolledOnce.current = false
    atBottom.current = true
    olderAnchor.current = null
  }, [conn, inOnboarding])

  useEffect(() => {
    const onScroll = () => {
      const near = nearBottom()
      atBottom.current = near
      setShowJump(!near)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (tasks.tasks.length === 0 || inOnboarding) return
    const root = document.documentElement
    if (olderAnchor.current !== null) {
      if (tasks.loadingMore) return
      // 위에 이전 작업이 붙어도 보던 자리를 지킨다(스크롤 앵커링이 없는 Safari 대비).
      const top = root.scrollHeight - olderAnchor.current
      olderAnchor.current = null
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top })
      return
    }
    // 처음 불러오면 맨 아래(최신)로, 이후엔 새 작업이든 답변이든 아래에 있을 때만 따라간다.
    if (!scrolledOnce.current || atBottom.current) {
      scrolledOnce.current = true
      window.scrollTo({ top: root.scrollHeight })
    }
  }, [tasks.tasks, tasks.loadingMore, inOnboarding])

  const loadOlder = () => {
    olderAnchor.current = document.documentElement.scrollHeight - window.scrollY
    void tasks.loadMore()
  }

  const screenName =
    session.phase === 'loading'
      ? null
      : session.phase === 'signedOut'
        ? 'sign_in'
        : session.phase === 'noWorkbook'
          ? 'setup'
          : inOnboarding
            ? 'onboarding'
            : 'main'
  useEffect(() => {
    if (screenName) track({ name: 'page_view', page_title: screenName })
  }, [screenName])

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>
    for (const x of tasks.tasks) c[x.status] += 1
    return c
  }, [tasks.tasks])

  const visible = useMemo(
    () => (filter === 'all' ? tasks.tasks : tasks.tasks.filter((x) => x.status === filter)),
    [tasks.tasks, filter],
  )

  const submit = useCallback(
    async (task: string, category: Category, source: TaskSource, images: File[] = []) => {
      try {
        let text = task
        if (images.length) {
          if (!conn) throw new Error('not connected')
          // 하나씩 올린다. 휴대폰 회선에서 큰 사진을 한꺼번에 올리면 잘 끊긴다.
          const ids: string[] = []
          for (const f of images) ids.push(await uploadImage(conn.token, f, t('attach.folder')))
          text = withImageLinks(task, ids, t('attach.label'))
        }
        await tasks.create(text, category)
        track({ name: 'task_send', category, source, images: images.length })
        setFilter('all')
        setToast({ text: t('composer.sent') })
        atBottom.current = true
        requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }))
        return true
      } catch {
        setToast({ text: t(images.length ? 'attach.failed' : 'composer.failed'), error: true })
        return false
      }
    },
    [tasks, t, conn],
  )

  const signOut = () => {
    logout()
    setSheet(false)
  }

  const createSheet = async (title: string) => {
    const w = await create(title)
    if (w) setOnb({ sheetId: w.spreadsheetId, step: 'google' })
  }

  const sendTest = async (text: string) => {
    try {
      const id = await tasks.create(text, 'quick_action')
      track({ name: 'task_send', category: 'quick_action', source: 'onboarding', images: 0 })
      setOnb((o) => (o ? { ...o, testId: id } : o))
      return id
    } catch {
      return null
    }
  }

  /** 친구에게 공유: 앱 주소를 복사한다(링크를 붙여 넣으면 미리보기 이미지가 뜬다). */
  const shareApp = async () => {
    setMenu(false)
    const url = import.meta.env.VITE_SITE_URL || window.location.origin + import.meta.env.BASE_URL
    try {
      await navigator.clipboard.writeText(url)
      track({ name: 'share', method: 'clipboard' })
      setToast({ text: t('share.copied') })
    } catch {
      track({ name: 'share', method: 'failed' })
      setToast({ text: t('share.failed', { url }), error: true })
    }
  }

  const finishOnboarding = (skipped: boolean) => {
    track({ name: 'onboarding_done', skipped })
    setOnb(null)
  }

  const onboardingProps = {
    email: session.phase === 'noWorkbook' || session.phase === 'ready' ? session.email : null,
    busy,
    tasks: tasks.tasks,
    testId: onb?.testId,
    settings,
    onCreate: createSheet,
    onStep: (step: Step) => setOnb((o) => (o ? { ...o, step } : o)),
    onSendTest: sendTest,
    onSettings: update,
    onFinish: finishOnboarding,
    onSignOut: signOut,
  }
  const onboarding = inOnboarding ? onb : null

  return (
    <I18nProvider locale={locale}>
      {session.phase === 'loading' ? (
        <main className="connect" aria-busy="true" />
      ) : session.phase === 'signedOut' ? (
        <SignInScreen error={session.error} onSignIn={signIn} />
      ) : session.phase === 'noWorkbook' ? (
        <Onboarding step="create" sheetUrl={null} {...onboardingProps} />
      ) : onboarding ? (
        <Onboarding step={onboarding.step} sheetUrl={session.workbook.url} {...onboardingProps} />
      ) : (
        <div className="app">
          <Header
            state={tasks.state}
            lastSyncedAt={tasks.lastSyncedAt}
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            onMenu={() => setMenu(true)}
            showFilters={tasks.tasks.length > 0}
          />
          {(tasks.state === 'unauthorized' || tasks.state === 'missing' || tasks.state === 'error') && (
            <div className={`banner${tasks.state === 'error' ? '' : ' banner-danger'}`} role="status">
              <Icon name="alert" size={18} />
              <span>{t(tasks.state === 'unauthorized' ? 'error.unauthorized' : tasks.state === 'missing' ? 'error.missing' : 'error.network')}</span>
              {tasks.state === 'unauthorized' && (
                <button type="button" className="banner-btn" onClick={signIn}>
                  {t('error.signIn')}
                </button>
              )}
              {tasks.state === 'missing' && (
                <button type="button" className="banner-btn" onClick={forgetWorkbook}>
                  {t('error.newSheet')}
                </button>
              )}
            </div>
          )}
          <main className="main">
            <DriveToken.Provider value={conn?.token ?? null}>
              <Timeline
                tasks={visible}
                freshIds={freshIds}
                loading={tasks.initialLoading}
                filtered={filter !== 'all'}
                hasMore={tasks.hasMore && filter === 'all'}
                loadingMore={tasks.loadingMore}
                onLoadMore={loadOlder}
              />
            </DriveToken.Provider>
          </main>
          {showJump && tasks.tasks.length > 0 && (
            <button
              type="button"
              className="jump"
              onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            >
              <Icon name="arrowDown" size={16} />
              {t('timeline.jumpLatest')}
            </button>
          )}
          <Composer disabled={tasks.state === 'unauthorized' || tasks.state === 'missing'} onSubmit={submit} />
        </div>
      )}
      {sheet && conn && session.phase === 'ready' && (
        <SettingsSheet
          settings={settings}
          conn={conn}
          email={session.email}
          sheetUrl={session.workbook.url}
          onClose={() => setSheet(false)}
          onPickle={() => {
            setSheet(false)
            setPickle(true)
          }}
          onSignOut={signOut}
          onSave={(s) => {
            update(s)
            setSheet(false)
          }}
        />
      )}
      {menu && session.phase === 'ready' && (
        <MenuSheet
          sheetUrl={session.workbook.url}
          onClose={() => setMenu(false)}
          onSettings={() => {
            setMenu(false)
            setSheet(true)
          }}
          onPickle={() => {
            setMenu(false)
            setPickle(true)
          }}
          onShare={shareApp}
        />
      )}
      {pickle && session.phase === 'ready' && <PickleSheet sheetUrl={session.workbook.url} onClose={() => setPickle(false)} />}
      {toast && (
        <div className={`toast${toast.error ? ' toast-error' : ''}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </I18nProvider>
  )
}
