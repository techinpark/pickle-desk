import { afterEach, describe, expect, it, vi } from 'vitest'
import readme from '../../README.md?raw'
import readmeEn from '../../README.en.md?raw'
import { FAKE_CONN, FAKE_TOKEN, fakeSheet } from '../test/fakeSheet'
import { backfillLine, pickleInstruction } from './pickle'
import {
  createTask,
  createWorkbook,
  findWorkbook,
  listTasks,
  normalizeDate,
  parseRows,
  REQUEST_TIMEOUT_MS,
  sheetTime,
  SheetError,
  toStatus,
} from './sheet'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const HEAD = ['Id', 'Task', 'Status', 'Category', 'Reply', 'Result', 'CreatedAt', 'UpdatedAt']
const kindOf = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as SheetError).kind

describe('parseRows', () => {
  it('maps columns by header name, skips empty rows and keeps rows without an Id', () => {
    const rows = parseRows([
      ['Task', 'Id', 'Status', 'Reply'], // 순서가 달라도 머리글 이름으로 찾는다
      ['A', 3, '완료', '했어요'],
      ['', 4, 'done', ''],
      ['B', '', '진행 중'],
    ])
    expect(rows.map((r) => [r.row, r.id, r.task.task, r.task.status, r.task.reply])).toEqual([
      [2, 3, 'A', 'done', '했어요'],
      [4, null, 'B', 'running', ''],
    ])
    expect(rows[0].task.category).toBe('task')
  })
})

describe('toStatus / normalizeDate / sheetTime', () => {
  it('understands Korean and loose statuses', () => {
    expect(['대기', '진행중', '완료', '실패', 'DONE', 'completed', '???'].map(toStatus)).toEqual([
      'pending',
      'running',
      'done',
      'failed',
      'done',
      'done',
      'pending',
    ])
  })

  it('reads strings and sheet serial numbers', () => {
    expect(normalizeDate('2026-10-28 09:00:00+09:00')).toBe('2026-10-28T00:00:00.000Z')
    expect(normalizeDate(46000)).toBe(new Date(2025, 11, 9).toISOString())
    expect(normalizeDate('어제')).toBeNull()
    expect(normalizeDate('')).toBeNull()
  })

  it('writes local time that normalizeDate reads back', () => {
    const d = new Date(2026, 10, 3, 16, 5, 9)
    expect(sheetTime(d)).toBe('2026-11-03 16:05:09')
    expect(normalizeDate(sheetTime(d))).toBe(d.toISOString())
  })
})

describe('listTasks', () => {
  it('returns newest first with paging and sends the bearer token', async () => {
    const { fetchMock } = fakeSheet([{ Task: 'a' }, { Task: 'b' }, { Task: 'c' }])
    const page = await listTasks(FAKE_CONN, { limit: 2 })
    expect(page.tasks.map((t) => t.task)).toEqual(['c', 'b'])
    expect(page).toMatchObject({ total: 3, hasMore: true })
    const older = await listTasks(FAKE_CONN, { beforeId: 2 })
    expect(older.tasks.map((t) => t.task)).toEqual(['a'])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({ authorization: `Bearer ${FAKE_TOKEN}` })
  })

  it('fills in Ids for rows Pickle added without one', async () => {
    const { db } = fakeSheet([{ Id: 5, Task: 'A' }, { Id: '', Task: 'B' }, { Id: '', Task: 'C' }])
    const page = await listTasks(FAKE_CONN)
    expect(page.tasks.map((t) => [t.id, t.task])).toEqual([
      [7, 'C'],
      [6, 'B'],
      [5, 'A'],
    ])
    expect(db.map((r) => r.Id)).toEqual([5, 6, 7])
  })

  it('maps API errors to kinds', async () => {
    const { state } = fakeSheet()
    state.reject = true
    expect(await kindOf(listTasks(FAKE_CONN))).toBe('unauthorized')
    state.reject = false
    state.missing = true
    expect(await kindOf(listTasks(FAKE_CONN))).toBe('notFound')
    state.missing = false
    state.offline = true
    expect(await kindOf(listTasks(FAKE_CONN))).toBe('network')
  })

  it('treats a renamed Tasks tab as a missing sheet', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Unable to parse range: Tasks!A1:H' } }), { status: 400 }))
    expect(await kindOf(listTasks(FAKE_CONN))).toBe('notFound')
  })

  it('does not call the API when the token is gone', async () => {
    const { fetchMock } = fakeSheet()
    const conn = {
      ...FAKE_CONN,
      token: () => {
        throw new SheetError('unauthorized')
      },
    }
    expect(await kindOf(listTasks(conn))).toBe('unauthorized')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('times out a hung request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_: unknown, init: RequestInit) =>
          new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    )
    const p = kindOf(listTasks(FAKE_CONN))
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    expect(await p).toBe('timeout')
  })
})

describe('createTask', () => {
  it('appends a pending row with the next Id as RAW text (no formulas)', async () => {
    const { db, fetchMock } = fakeSheet([{ Id: 7, Task: 'A' }])
    expect(await createTask(FAKE_CONN, '=IMPORTXML("x")', 'idea')).toBe(8)
    expect(db[1]).toMatchObject({ Id: 8, Task: '=IMPORTXML("x")', Status: 'pending', Category: 'idea', Reply: '' })
    expect(normalizeDate(db[1].CreatedAt)).not.toBeNull()
    const append = fetchMock.mock.calls.find(([u]) => String(u).includes(':append'))!
    expect(String(append[0])).toContain('valueInputOption=RAW')
  })
})

describe('workbook', () => {
  it('creates the Tasks sheet with headers, dropdowns and an app marker', async () => {
    const { fetchMock, state } = fakeSheet()
    const w = await createWorkbook(FAKE_CONN.token, 'Pickle Desk 작업함')
    expect(w).toEqual({ spreadsheetId: 'new-sheet', url: 'https://docs.google.com/spreadsheets/d/new-sheet/edit' })
    const body = state.created[0] as {
      properties: { title: string }
      sheets: { properties: { title: string }; data: { rowData: { values: { userEnteredValue: { stringValue: string } }[] }[] }[] }[]
    }
    expect(body.properties.title).toBe('Pickle Desk 작업함')
    expect(body.sheets[0].properties.title).toBe('Tasks')
    expect(body.sheets[0].data[0].rowData[0].values.map((v) => v.userEnteredValue.stringValue)).toEqual(HEAD)
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')!
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ appProperties: { pickleDesk: 'tasks' } })
  })

  it('finds the newest workbook the app made, or nothing', async () => {
    const { state, fetchMock } = fakeSheet()
    expect(await findWorkbook(FAKE_CONN.token)).toBeNull()
    state.files = ['old-one']
    expect(await findWorkbook(FAKE_CONN.token)).toEqual({ spreadsheetId: 'old-one', url: 'https://docs.google.com/spreadsheets/d/old-one/edit' })
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain("appProperties has { key='pickleDesk' and value='tasks' }")
  })
})

describe('pickle instruction', () => {
  it('includes the sheet link and matches README step 5 line for line', () => {
    const text = pickleInstruction('https://docs.google.com/spreadsheets/d/abc/edit')
    expect(text.split('\n')[0]).toBe('이 구글 시트가 내 작업함이야: https://docs.google.com/spreadsheets/d/abc/edit')
    for (const line of text.split('\n').slice(1)) expect(readme).toContain(line)
  })

  it('adds the one-time backfill line only when asked, matching README', () => {
    expect(pickleInstruction('u').split('\n')).toHaveLength(9)
    const withBackfill = pickleInstruction('u', 30).split('\n')
    expect(withBackfill).toHaveLength(10)
    expect(withBackfill[9]).toBe(backfillLine(30))
    expect(withBackfill[9]).toContain('최근 30일')
    expect(readme).toContain(backfillLine(7))
  })

  it('has an English version that matches README.en.md', () => {
    const text = pickleInstruction('u', 7, 'en').split('\n')
    expect(text[0]).toBe('This Google Sheet is my task inbox: u')
    for (const line of text.slice(1)) expect(readmeEn).toContain(line)
    expect(text.join('\n')).not.toMatch(/[가-힣]/)
  })
})
