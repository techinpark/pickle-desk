import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAKE_CONN, fakeSheet } from '../test/fakeSheet'
import { PAGE_SIZE, type Page } from './sheet'
import type { Task } from './types'
import { applyFirstPage, changedIds, mergeTasks, useTasks } from './useTasks'

const t = (id: number, createdAt: string, extra: Partial<Task> = {}): Task => ({
  id,
  task: `t${id}`,
  status: 'pending',
  reply: '',
  result: '',
  category: 'task',
  createdAt,
  updatedAt: null,
  ...extra,
})

describe('mergeTasks', () => {
  it('sorts oldest first and replaces by id', () => {
    const merged = mergeTasks(
      [t(1, '2026-10-28T01:00:00Z'), t(2, '2026-10-28T02:00:00Z')],
      [t(2, '2026-10-28T02:00:00Z', { status: 'done' }), t(3, '2026-10-28T00:30:00Z')],
    )
    expect(merged.map((x) => x.id)).toEqual([3, 1, 2])
    expect(merged.find((x) => x.id === 2)?.status).toBe('done')
  })
  it('breaks ties by id', () => {
    const same = '2026-10-28T01:12:22.000Z'
    expect(mergeTasks([], [t(11, same), t(10, same)]).map((x) => x.id)).toEqual([10, 11])
  })
})

describe('changedIds', () => {
  it('reports status, reply or result changes but not new tasks', () => {
    const prev = new Map([
      [1, t(1, 'a')],
      [2, t(2, 'b')],
      [3, t(3, 'c')],
    ])
    const next = [t(1, 'a', { status: 'running' }), t(2, 'b'), t(3, 'c', { reply: 'hi' }), t(4, 'd')]
    expect(changedIds(prev, next)).toEqual([1, 3])
  })
})

const page = (tasks: Task[], hasMore: boolean, total = tasks.length): Page => ({ tasks, hasMore, total })
const at = (id: number, extra: Partial<Task> = {}) => t(id, `2026-10-28T00:${String(id % 60).padStart(2, '0')}:00.000Z`, extra)

describe('applyFirstPage', () => {
  it('takes hasMore from the server on the first successful page', () => {
    expect(applyFirstPage([], false, page([at(5), at(4)], true), true).hasMore).toBe(true)
  })

  it('keeps older loaded pages and hasMore on later refreshes', () => {
    const prev = [at(1), at(2), at(3), at(4)]
    const next = applyFirstPage(prev, false, page([at(5), at(4), at(3)], true), false)
    expect(next.tasks.map((x) => x.id)).toEqual([1, 2, 3, 4, 5])
    expect(next.hasMore).toBe(false)
  })

  it('drops tasks deleted on the server inside the fetched id range', () => {
    const next = applyFirstPage([at(1), at(2), at(3), at(4)], false, page([at(4), at(2)], false), false)
    expect(next.tasks.map((x) => x.id)).toEqual([1, 2, 4])
  })

  it('keeps a just-created task newer than a response that left before it', () => {
    const next = applyFirstPage([at(1), at(2), at(9)], false, page([at(2), at(1)], false), false)
    expect(next.tasks.map((x) => x.id)).toEqual([1, 2, 9])
  })

  it('restarts from the new page when more than a page arrived between polls', () => {
    const next = applyFirstPage([at(1), at(2)], false, page([at(40), at(39)], true), false)
    expect(next.tasks.map((x) => x.id)).toEqual([39, 40])
    expect(next.hasMore).toBe(true)
  })
})

describe('useTasks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  const conn = FAKE_CONN
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ Task: `job ${i + 1}` }))

  it('still offers older tasks when the first request failed', async () => {
    const { state } = fakeSheet(many(35))
    state.offline = true
    const { result } = renderHook(() => useTasks(conn, 5))
    await waitFor(() => expect(result.current.state).toBe('error'))
    state.offline = false
    await act(() => result.current.refresh())
    expect(result.current.tasks).toHaveLength(PAGE_SIZE)
    expect(result.current.hasMore).toBe(true)
  })

  it('pages by id so tasks deleted meanwhile do not skip older ones', async () => {
    const { db } = fakeSheet(many(35))
    const { result } = renderHook(() => useTasks(conn, 5))
    await waitFor(() => expect(result.current.tasks).toHaveLength(PAGE_SIZE))
    db.splice(
      db.findIndex((r) => r.Id === 20),
      3,
    ) // 20, 21, 22 삭제
    await act(() => result.current.loadMore())
    const ids = result.current.tasks.map((x) => x.id)
    for (const id of [1, 2, 3, 4, 5]) expect(ids).toContain(id)
    expect(result.current.hasMore).toBe(false)
  })

  it('loads older tasks once even if asked twice', async () => {
    const { fetchMock } = fakeSheet(many(35))
    const { result } = renderHook(() => useTasks(conn, 5))
    await waitFor(() => expect(result.current.tasks).toHaveLength(PAGE_SIZE))
    const before = fetchMock.mock.calls.length
    await act(() => Promise.all([result.current.loadMore(), result.current.loadMore()]))
    expect(fetchMock.mock.calls.length - before).toBe(1)
    expect(result.current.tasks).toHaveLength(35)
  })

  it('ignores a late response from the previous connection and never runs two refreshes at once', async () => {
    let active = 0
    let maxActive = 0
    const pending: (() => void)[] = []
    const body = (token: string) =>
      JSON.stringify({ values: [['Id', 'Task'], [token === 'old' ? 1 : 2, token]] })
    vi.stubGlobal(
      'fetch',
      vi.fn((_: string, init: RequestInit) => {
        const token = (init.headers as Record<string, string>).authorization.replace('Bearer ', '')
        active += 1
        maxActive = Math.max(maxActive, active)
        return new Promise<Response>((resolve) =>
          pending.push(() => {
            active -= 1
            resolve(new Response(body(token)))
          }),
        )
      }),
    )
    const as = (token: string) => ({ spreadsheetId: FAKE_CONN.spreadsheetId, token: () => token })
    const { result, rerender } = renderHook(({ c }) => useTasks(c, 5), { initialProps: { c: as('old') } })
    await waitFor(() => expect(pending).toHaveLength(1))
    rerender({ c: as('new') })
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[0]()) // 이전 연결 응답이 늦게 도착
    expect(result.current.tasks).toEqual([])
    // 새 연결 요청이 아직 진행 중이므로 겹쳐 보내지 않는다(예전엔 이전 요청의 finally 가 표시를 지웠다)
    await act(async () => void result.current.refresh())
    expect(pending).toHaveLength(2)
    expect(maxActive).toBe(2)
    await act(async () => pending[1]())
    expect(result.current.tasks.map((x) => x.task)).toEqual(['new'])
  })
})
