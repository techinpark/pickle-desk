import { useCallback, useEffect, useRef, useState } from 'react'
import { createTask, listTasks, SheetError, type Connection, type Page } from './sheet'
import type { Category, ConnectionState, Task } from './types'

export interface TasksState {
  tasks: Task[] // 오래된 것 → 최신 순 (채팅처럼 아래가 최신)
  state: ConnectionState
  lastSyncedAt: Date | null
  hasMore: boolean
  loadingMore: boolean
  initialLoading: boolean
}

export function mergeTasks(current: Task[], incoming: Task[]): Task[] {
  const byId = new Map(current.map((t) => [t.id, t]))
  for (const t of incoming) byId.set(t.id, t)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}

/**
 * 첫 페이지(최신 작업들)를 새로 받았을 때 목록과 hasMore 를 정한다.
 * - first: 이 연결에서 처음 성공한 응답이면 서버가 알려 준 hasMore 를 그대로 쓴다(앞선 실패와 무관).
 * - 받은 Id 범위 안에 있는데 응답에 없는 작업은 서버에서 지워진 것이라 뺀다.
 *   범위보다 큰 Id(방금 만든 작업)는 응답이 그보다 먼저 출발했을 수 있으니 둔다.
 * - 폴링 사이에 한 페이지보다 많이 쌓여 이어지지 않으면, 구멍 난 목록을 두지 않고 새 페이지부터 다시 시작한다.
 */
export function applyFirstPage(
  prev: Task[],
  prevHasMore: boolean,
  page: Page,
  first: boolean,
): { tasks: Task[]; hasMore: boolean } {
  if (page.tasks.length === 0) return { tasks: prev, hasMore: false }
  const ids = new Set(page.tasks.map((t) => t.id))
  const lo = Math.min(...ids)
  const hi = Math.max(...ids)
  const gap = !first && page.hasMore && prev.length > 0 && !prev.some((t) => t.id >= lo && t.id <= hi)
  const base =
    first || gap ? prev.filter((t) => t.id > hi) : prev.filter((t) => t.id < lo || t.id > hi || ids.has(t.id))
  return {
    tasks: mergeTasks(base, page.tasks),
    hasMore: first || gap ? page.hasMore : page.hasMore && prevHasMore,
  }
}

/** 알림을 켰을 때 앱이 가려져 있는 동안의 확인 주기(초). 시트 API 할당량을 아끼려고 화면에 보일 때보다 느리게. */
export const BACKGROUND_POLL_SECONDS = 30

export function useTasks(conn: Connection | null, pollSeconds: number, background = false) {
  const [s, setS] = useState<TasksState>({
    tasks: [],
    state: conn ? 'connecting' : 'idle',
    lastSyncedAt: null,
    hasMore: false,
    loadingMore: false,
    initialLoading: !!conn,
  })
  const connRef = useRef(conn)
  const gen = useRef(0) // 연결이 바뀌면 이전 요청 결과를 버린다
  // 진행 중인 새로고침이 어느 연결(gen) 것인지. 이전 연결의 요청이 늦게 끝나도 지금 연결의 표시를 지우지 않게 gen 으로 비교한다.
  const inFlight = useRef<number | null>(null)
  const moreInFlight = useRef<number | null>(null)
  const tasksRef = useRef<Task[]>([])
  useEffect(() => {
    tasksRef.current = s.tasks
  }, [s.tasks])

  const refresh = useCallback(async () => {
    const c = connRef.current
    const g = gen.current
    if (!c || inFlight.current === g) return
    inFlight.current = g
    try {
      const page = await listTasks(c)
      if (g !== gen.current) return
      setS((p) => {
        const next = applyFirstPage(p.tasks, p.hasMore, page, p.lastSyncedAt === null)
        return { ...p, ...next, state: 'online', lastSyncedAt: new Date(), initialLoading: false }
      })
    } catch (e) {
      if (g !== gen.current) return
      const state = e instanceof SheetError && e.unauthorized ? 'unauthorized' : e instanceof SheetError && e.kind === 'notFound' ? 'missing' : 'error'
      setS((p) => ({ ...p, state, initialLoading: false }))
    } finally {
      if (inFlight.current === g) inFlight.current = null
    }
  }, [])

  // 연결이 바뀌면 처음부터 다시 받는다.
  useEffect(() => {
    connRef.current = conn
    gen.current += 1
    tasksRef.current = []
    setS({
      tasks: [],
      state: conn ? 'connecting' : 'idle',
      lastSyncedAt: null,
      hasMore: false,
      loadingMore: false,
      initialLoading: !!conn,
    })
    if (conn) void refresh()
  }, [conn, refresh])

  // 폴링: 탭이 가려져 있으면 쉬고(알림을 켰으면 느리게 계속), 다시 보이면 바로 새로고침한다.
  // 토큰이 거부되거나 시트가 사라지면 멈춘다.
  const stopped = s.state === 'unauthorized' || s.state === 'missing' || !conn
  useEffect(() => {
    if (stopped) return
    let last = Date.now()
    const id = window.setInterval(() => {
      const visible = document.visibilityState === 'visible'
      const due = Date.now() - last >= Math.max(pollSeconds, BACKGROUND_POLL_SECONDS) * 1000 - 50
      if (visible || (background && due)) {
        last = Date.now()
        void refresh()
      }
    }, pollSeconds * 1000)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [stopped, pollSeconds, background, refresh])

  const loadMore = useCallback(async () => {
    const c = connRef.current
    const g = gen.current
    if (!c || moreInFlight.current === g) return
    const oldest = tasksRef.current[0]
    if (!oldest) return
    moreInFlight.current = g
    setS((p) => ({ ...p, loadingMore: true }))
    try {
      // 가장 작은 Id 보다 오래된 것만 받는다(채팅 순서라 맨 앞이 가장 오래된 작업).
      const minId = Math.min(...tasksRef.current.map((t) => t.id))
      const page = await listTasks(c, { beforeId: minId })
      if (g !== gen.current) return
      setS((p) => ({ ...p, tasks: mergeTasks(p.tasks, page.tasks), hasMore: page.hasMore, loadingMore: false }))
    } catch {
      if (g === gen.current) setS((p) => ({ ...p, loadingMore: false }))
    } finally {
      if (moreInFlight.current === g) moreInFlight.current = null
    }
  }, [])

  const create = useCallback(
    async (task: string, category: Category) => {
      const c = connRef.current
      if (!c) throw new Error('not connected')
      const g = gen.current
      const id = await createTask(c, task, category)
      if (g !== gen.current) return id
      const now = new Date().toISOString()
      // 새로고침이 먼저 서버 값을 가져왔으면 덮어쓰지 않는다(이미 running 일 수 있다).
      setS((p) =>
        p.tasks.some((x) => x.id === id)
          ? p
          : {
              ...p,
              tasks: mergeTasks(p.tasks, [
                { id, task, status: 'pending', reply: '', result: '', category, createdAt: now, updatedAt: null },
              ]),
            },
      )
      void refresh()
      return id
    },
    [refresh],
  )

  return { ...s, refresh, loadMore, create }
}

/** 지난 상태와 비교해 상태·답변·결과가 바뀐 작업 ID. 새로 생긴 작업은 넣지 않는다. */
export function changedIds(prev: Map<number, Task>, next: Task[]): number[] {
  return next
    .filter((t) => {
      const p = prev.get(t.id)
      return p && (p.status !== t.status || p.reply !== t.reply || p.result !== t.result)
    })
    .map((t) => t.id)
}
