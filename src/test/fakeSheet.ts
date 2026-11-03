import { vi } from 'vitest'
import { CONN_KEY } from '../lib/connection'

export const FAKE_URL = 'https://script.google.com/macros/s/AKfake123/exec'
export const FAKE_SHEET_KEY = 'fake-sheet-key'
export const FAKE_CONN = { url: FAKE_URL, key: FAKE_SHEET_KEY }

/** 저장된 연결이 있는 상태로 시작한다. */
export function storeFakeConnection(key = FAKE_SHEET_KEY) {
  localStorage.setItem(CONN_KEY, JSON.stringify({ url: FAKE_URL, key }))
}

export interface Rec {
  Id: number
  Task: string
  Status: string
  Reply: string | null
  Result: string | null
  Category: string
  CreatedAt: string
  UpdatedAt: string | null
}

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 })

/** 메모리 안의 Apps Script 웹 앱 흉내. fetch 를 바꿔 끼운다. state.reject 면 연결 키를 거부한다. */
export function fakeSheet(initial: Partial<Rec>[] = []) {
  let nextId = 100
  const db: Rec[] = initial.map((r, i) => ({
    Id: r.Id ?? i + 1,
    Task: r.Task ?? `task ${i + 1}`,
    Status: r.Status ?? 'pending',
    Reply: r.Reply ?? null,
    Result: r.Result ?? null,
    Category: r.Category ?? 'task',
    CreatedAt: r.CreatedAt ?? `2026-10-28T0${i}:00:00.000Z`,
    UpdatedAt: null,
  }))
  const state = { offline: false, reject: false, html: false }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (state.offline) throw new TypeError('Failed to fetch')
    if (state.html) return new Response('<html>Sign in</html>', { status: 200 })
    const url = new URL(String(input))
    const p: Record<string, string> =
      (init.method ?? 'GET') === 'POST' ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams)
    if (state.reject || p.key !== FAKE_SHEET_KEY) return json({ ok: false, error: 'unauthorized' })
    if (p.action === 'create') {
      const rec: Rec = {
        Id: nextId++,
        Task: p.task,
        Status: 'pending',
        Category: p.category,
        Reply: null,
        Result: null,
        CreatedAt: '2026-10-28T09:00:00.000Z',
        UpdatedAt: null,
      }
      db.push(rec)
      return json({ ok: true, Id: rec.Id })
    }
    const limit = Number(p.limit ?? 30)
    const rows = p.beforeId ? db.filter((r) => r.Id < Number(p.beforeId)) : db
    const sorted = [...rows].sort((a, b) => b.Id - a.Id)
    return json({ ok: true, list: sorted.slice(0, limit), total: db.length, hasMore: sorted.length > limit })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { db, fetchMock, state }
}
