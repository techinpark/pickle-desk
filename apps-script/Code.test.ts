// Code.gs 를 가짜 SpreadsheetApp 위에서 돌린다. 실제 구글 시트 없이 웹 앱 동작(키 확인·목록·등록)을 확인한다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(path.join(import.meta.dirname, 'Code.gs'), 'utf8')
const KEY = 'k'.repeat(64)

function fakeSheet(rows: unknown[][]) {
  const data = rows.map((r) => [...r])
  const range = (row: number, col: number, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => data[row - 1 + i]?.[col - 1 + j] ?? '')),
    setValue: (v: unknown) => {
      for (let i = 0; i < nr; i++) (data[row - 1 + i] ??= [])[col - 1] = v
    },
  })
  return {
    data,
    getName: () => 'Tasks',
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(...data.map((r) => r.length)),
    getRange: range,
    appendRow: (r: unknown[]) => data.push(r),
  }
}

function load(rows: unknown[][]) {
  const sheet = fakeSheet(rows)
  const props = new Map([['KEY', KEY]])
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n: string) => (n === 'Tasks' ? sheet : null) }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ body: JSON.parse(s), setMimeType() { return this } }),
    },
  })
  vm.runInContext(SOURCE, ctx)
  const fn = ctx as unknown as Record<string, (e: unknown) => { body: Record<string, unknown> }>
  return {
    sheet,
    get: (p: Record<string, string>) => fn.doGet({ parameter: p }).body,
    post: (b: unknown) => fn.doPost({ postData: { contents: JSON.stringify(b) } }).body,
  }
}

const HEAD = ['Id', 'Task', 'Status', 'Category', 'Reply', 'Result', 'CreatedAt', 'UpdatedAt']

describe('Code.gs web app', () => {
  it('rejects a missing or wrong key', () => {
    const s = load([HEAD])
    expect(s.get({ action: 'list' })).toEqual({ ok: false, error: 'unauthorized' })
    expect(s.get({ action: 'list', key: 'nope' })).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('lists newest first with paging, normalizing statuses written in Korean', () => {
    const s = load([
      HEAD,
      [1, '첫 작업', '완료', 'task', '했어요', '', new Date('2026-11-01T00:00:00Z'), ''],
      [2, '둘째', '진행 중', 'idea', '', '', '2026-11-02 09:00:00', ''],
      [3, '셋째', '', 'weird', '', '', '', ''],
    ])
    const page = s.get({ action: 'list', key: KEY, limit: '2' })
    expect(page).toMatchObject({ ok: true, total: 3, hasMore: true })
    const list = page.list as Record<string, unknown>[]
    expect(list.map((r) => r.Id)).toEqual([3, 2])
    expect(list[0]).toMatchObject({ Status: 'pending', Category: 'task', CreatedAt: null })
    expect(list[1]).toMatchObject({ Status: 'running', Category: 'idea' })
    const older = s.get({ action: 'list', key: KEY, beforeId: '2' })
    expect((older.list as Record<string, unknown>[]).map((r) => r.Id)).toEqual([1])
    expect((older.list as Record<string, unknown>[])[0]).toMatchObject({ Status: 'done', Reply: '했어요', CreatedAt: '2026-11-01T00:00:00.000Z' })
  })

  it('fills in an Id for rows the assistant added by hand and skips empty rows', () => {
    const s = load([HEAD, [5, 'A', 'done', 'task'], ['', 'B', 'pending', 'task'], ['', '', '', '']])
    const list = s.get({ action: 'list', key: KEY }).list as Record<string, unknown>[]
    expect(list.map((r) => [r.Id, r.Task])).toEqual([
      [6, 'B'],
      [5, 'A'],
    ])
    expect(s.sheet.data[2][0]).toBe(6)
  })

  it('creates a pending task with the next Id and guards against formulas', () => {
    const s = load([HEAD, [7, 'A', 'done', 'task']])
    expect(s.post({ action: 'create', key: KEY, task: '  보고서 써 줘 ', category: 'idea' })).toEqual({ ok: true, Id: 8 })
    expect(s.sheet.data[2].slice(0, 4)).toEqual([8, '보고서 써 줘', 'pending', 'idea'])
    expect(Object.prototype.toString.call(s.sheet.data[2][6])).toBe('[object Date]')
    s.post({ action: 'create', key: KEY, task: '=IMPORTXML("x")', category: 'nope' })
    expect(s.sheet.data[3].slice(1, 4)).toEqual(['\'=IMPORTXML("x")', 'pending', 'task'])
  })

  it('refuses empty tasks, bad JSON and unknown actions', () => {
    const s = load([HEAD])
    expect(s.post({ action: 'create', key: KEY, task: '   ' })).toEqual({ ok: false, error: 'empty_task' })
    expect(s.get({ action: 'drop', key: KEY })).toEqual({ ok: false, error: 'unknown_action' })
    const ctxPost = load([HEAD])
    expect(ctxPost.post('not an object')).toMatchObject({ ok: false })
  })
})
