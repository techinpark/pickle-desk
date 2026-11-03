import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { Icon } from './components/Icon'
import { ConnectScreen } from './components/ConnectScreen'
import { SettingsSheet } from './components/SettingsSheet'
import { Timeline } from './components/Timeline'
import { I18nProvider } from './i18n/i18n'
import { translator } from './i18n/translate'
import { loadConnection, parseConnectLink, saveConnection } from './lib/connection'
import { loadSettings, resolveLocale, saveSettings, type Settings } from './lib/settings'
import type { Connection } from './lib/sheet'
import { STATUSES, type Category, type Status, type Task } from './lib/types'
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

  // 시트 메뉴의 연결 링크(#connect?u=…&k=…)로 열면 그 연결을 쓰고, 주소창에서 키를 지운다.
  const [conn, setConn] = useState<Connection | null>(() => {
    const link = parseConnectLink(window.location.hash)
    if (!link) return loadConnection()
    saveConnection(link)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return link
  })
  // 키가 거부되면 연결 화면으로 돌아가되, 입력값은 미리 채워 둔다.
  const [reconnect, setReconnect] = useState(false)
  const connect = useCallback((c: Connection | null) => {
    saveConnection(c)
    setConn(c)
    setReconnect(false)
  }, [])
  const tasks = useTasks(reconnect ? null : conn, settings.pollSeconds)

  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [sheet, setSheet] = useState(false)
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
  useEffect(() => {
    const ids = changedIds(prevRef.current, tasks.tasks)
    prevRef.current = new Map(tasks.tasks.map((x) => [x.id, x]))
    if (ids.length === 0) return
    setFreshIds(new Set(ids))
    const id = window.setTimeout(() => setFreshIds(new Set()), 2400)
    return () => window.clearTimeout(id)
  }, [tasks.tasks])

  // 스크롤 따라가기. 아래 근처에 있었는지는 새 내용이 그려지기 "전" 값을 써야 해서 스크롤할 때마다 기억해 둔다.
  // (그린 뒤에 재면 긴 답변이 붙는 순간 아래에서 멀어진 것으로 보여 따라가지 못한다.)
  const atBottom = useRef(true)
  const scrolledOnce = useRef(false)
  const olderAnchor = useRef<number | null>(null) // 이전 작업을 불러올 때 아래에서부터 떨어진 거리
  useEffect(() => {
    scrolledOnce.current = false
    atBottom.current = true
    olderAnchor.current = null
  }, [conn])

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
    if (tasks.tasks.length === 0) return
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
  }, [tasks.tasks, tasks.loadingMore])

  const loadOlder = () => {
    olderAnchor.current = document.documentElement.scrollHeight - window.scrollY
    void tasks.loadMore()
  }

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
    async (task: string, category: Category) => {
      try {
        await tasks.create(task, category)
        setFilter('all')
        setToast({ text: t('composer.sent') })
        atBottom.current = true
        requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }))
        return true
      } catch {
        setToast({ text: t('composer.failed'), error: true })
        return false
      }
    },
    [tasks, t],
  )

  const disconnect = () => {
    connect(null)
    setSheet(false)
  }

  return (
    <I18nProvider locale={locale}>
      {!conn || reconnect ? (
        <ConnectScreen initial={reconnect ? conn : null} onConnect={connect} />
      ) : (
        <div className="app">
          <Header
            state={tasks.state}
            lastSyncedAt={tasks.lastSyncedAt}
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            onSettings={() => setSheet(true)}
            showFilters={tasks.tasks.length > 0}
          />
          {(tasks.state === 'unauthorized' || tasks.state === 'error') && (
            <div className={`banner${tasks.state === 'unauthorized' ? ' banner-danger' : ''}`} role="status">
              <Icon name="alert" size={18} />
              <span>{t(tasks.state === 'unauthorized' ? 'error.unauthorized' : 'error.network')}</span>
              {tasks.state === 'unauthorized' && (
                <button type="button" className="banner-btn" onClick={() => setReconnect(true)}>
                  {t('error.reconnect')}
                </button>
              )}
            </div>
          )}
          <main className="main">
            <Timeline
              tasks={visible}
              freshIds={freshIds}
              loading={tasks.initialLoading}
              filtered={filter !== 'all'}
              hasMore={tasks.hasMore && filter === 'all'}
              loadingMore={tasks.loadingMore}
              onLoadMore={loadOlder}
            />
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
          <Composer disabled={tasks.state === 'unauthorized'} onSubmit={submit} />
        </div>
      )}
      {sheet && conn && !reconnect && (
        <SettingsSheet
          settings={settings}
          conn={conn}
          onClose={() => setSheet(false)}
          onDisconnect={disconnect}
          onSave={(s) => {
            update(s)
            setSheet(false)
          }}
        />
      )}
      {toast && (
        <div className={`toast${toast.error ? ' toast-error' : ''}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </I18nProvider>
  )
}
