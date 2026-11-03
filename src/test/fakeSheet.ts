import { vi } from 'vitest'
import { HEADERS, sheetUrl } from '../lib/sheet'

export const FAKE_TOKEN = 'fake-access-token'
export const FAKE_EMAIL = 'tester@example.com'
export const FAKE_SHEET_ID = 'sheet-123'
export const FAKE_CONN = { spreadsheetId: FAKE_SHEET_ID, token: () => FAKE_TOKEN }

/** 로그인돼 있고 작업함도 기억하는 상태로 시작한다. */
export function storeFakeSession(opts: { expired?: boolean; workbook?: boolean } = {}) {
  localStorage.setItem(
    'pickledesk.token.v1',
    JSON.stringify({ accessToken: FAKE_TOKEN, expiresAt: Date.now() + (opts.expired ? -1000 : 3_600_000), email: FAKE_EMAIL }),
  )
  if (opts.workbook !== false) {
    localStorage.setItem('pickledesk.workbook.v1', JSON.stringify({ spreadsheetId: FAKE_SHEET_ID, url: sheetUrl(FAKE_SHEET_ID), email: FAKE_EMAIL }))
  }
}

export interface Rec {
  Id: number | ''
  Task: string
  Status: string
  Reply: string
  Result: string
  Category: string
  CreatedAt: string | number
  UpdatedAt: string
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })
const err = (status: number, message = 'error') => json({ error: { code: status, message } }, status)

/**
 * 메모리 안의 구글 시트·드라이브 API 흉내. fetch 를 바꿔 끼운다.
 * db 는 Tasks 탭의 행(머리글 제외)이고, 피클이 쓴 것처럼 테스트에서 직접 고친다.
 */
export function fakeSheet(initial: Partial<Rec>[] = []) {
  const db: Rec[] = initial.map((r, i) => ({
    Id: r.Id ?? i + 1,
    Task: r.Task ?? `task ${i + 1}`,
    Status: r.Status ?? 'pending',
    Reply: r.Reply ?? '',
    Result: r.Result ?? '',
    Category: r.Category ?? 'task',
    CreatedAt: r.CreatedAt ?? `2026-10-28 0${i}:00:00`,
    UpdatedAt: r.UpdatedAt ?? '',
  }))
  const state = { offline: false, reject: false, missing: false, files: [] as string[], created: [] as unknown[] }
  const grid = () => [[...HEADERS], ...db.map((r) => HEADERS.map((h) => r[h]))]

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (state.offline) throw new TypeError('Failed to fetch')
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    if (url.hostname === 'oauth2.googleapis.com') return json({})
    const auth = (init.headers as Record<string, string> | undefined)?.authorization
    if (state.reject || auth !== `Bearer ${FAKE_TOKEN}`) return err(401, 'Invalid Credentials')
    if (url.hostname === 'openidconnect.googleapis.com') return json({ email: FAKE_EMAIL })

    if (url.hostname === 'www.googleapis.com') {
      if (method === 'GET') return json({ files: state.files.map((id) => ({ id })) })
      return json({ id: url.pathname.split('/').pop() })
    }

    const path = decodeURIComponent(url.pathname)
    if (path === '/v4/spreadsheets' && method === 'POST') {
      state.created.push(body)
      return json({ spreadsheetId: 'new-sheet', sheets: [{ properties: { sheetId: 7 } }] })
    }
    if (path.endsWith(':batchUpdate') && !path.includes('/values')) return json({})
    if (state.missing) return err(404, 'Requested entity was not found.')
    if (path.endsWith('/values:batchUpdate')) {
      for (const d of body.data as { range: string; values: unknown[][] }[]) {
        const row = Number(/A(\d+)$/.exec(d.range)![1])
        db[row - 2].Id = d.values[0][0] as number
      }
      return json({})
    }
    if (path.endsWith(':append')) {
      const [v] = body.values as unknown[][]
      db.push(Object.fromEntries(HEADERS.map((h, i) => [h, v[i]])) as unknown as Rec)
      return json({})
    }
    if (path.includes('/values/Tasks!A2:A')) return json({ values: [db.map((r) => r.Id)] })
    if (path.includes('/values/Tasks!A1:H')) return json({ values: grid() })
    return err(400, `unhandled ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { db, fetchMock, state }
}
