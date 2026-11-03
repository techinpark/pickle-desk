import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAKE_CONN, FAKE_URL } from '../test/fakeSheet'
import { parseConnectLink } from './connection'
import { createTask, isScriptUrl, listTasks, normalizeDate, REQUEST_TIMEOUT_MS, SheetError, toTask } from './sheet'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubFetch(body: unknown, status = 200) {
  const spy = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('toTask', () => {
  it('maps sheet columns', () => {
    expect(
      toTask({ Id: 3, Task: 'do it', Status: 'running', Reply: 'on it', Result: 'r', Category: 'briefing', CreatedAt: '2026-10-28 01:12:22Z' }),
    ).toEqual({
      id: 3,
      task: 'do it',
      status: 'running',
      reply: 'on it',
      result: 'r',
      category: 'briefing',
      createdAt: '2026-10-28T01:12:22.000Z',
      updatedAt: null,
    })
  })

  it('falls back on unknown status, category and empty fields', () => {
    const t = toTask({ Id: 1, Status: 'weird', Category: null, Task: null })
    expect(t.status).toBe('pending')
    expect(t.category).toBe('task')
    expect(t.task).toBe('')
    expect(t.createdAt).toBe(new Date(0).toISOString())
  })
})

describe('normalizeDate', () => {
  it('parses space-separated timestamps and rejects garbage', () => {
    expect(normalizeDate('2026-10-28 09:00:00+09:00')).toBe('2026-10-28T00:00:00.000Z')
    expect(normalizeDate('어제')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
  })
})

describe('isScriptUrl', () => {
  it('accepts only Apps Script web app URLs', () => {
    expect(isScriptUrl(FAKE_URL)).toBe(true)
    expect(isScriptUrl('https://script.google.com/macros/s/abc/dev')).toBe(false)
    expect(isScriptUrl('http://script.google.com/macros/s/abc/exec')).toBe(false)
    expect(isScriptUrl('https://evil.example/macros/s/abc/exec')).toBe(false)
    expect(isScriptUrl('not a url')).toBe(false)
  })
})

describe('parseConnectLink', () => {
  it('reads the url and key from the sheet menu link', () => {
    expect(parseConnectLink(`#connect?u=${encodeURIComponent(FAKE_URL)}&k=abc`)).toEqual({ url: FAKE_URL, key: 'abc' })
  })
  it('ignores other hashes and links to other hosts', () => {
    expect(parseConnectLink('#settings')).toBeNull()
    expect(parseConnectLink(`#connect?u=${encodeURIComponent('https://evil.example/x')}&k=abc`)).toBeNull()
    expect(parseConnectLink(`#connect?u=${encodeURIComponent(FAKE_URL)}`)).toBeNull()
  })
})

describe('listTasks', () => {
  it('sends the key as a query parameter without custom headers (no CORS preflight)', async () => {
    const spy = stubFetch({ ok: true, list: [{ Id: 1, Task: 'a' }], total: 1, hasMore: false })
    const page = await listTasks(FAKE_CONN, { beforeId: 9, limit: 5 })
    const [url, init = {}] = spy.mock.calls[0]
    expect(url.searchParams.get('action')).toBe('list')
    expect(url.searchParams.get('key')).toBe(FAKE_CONN.key)
    expect(url.searchParams.get('beforeId')).toBe('9')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(init.headers).toBeUndefined()
    expect(page).toMatchObject({ total: 1, hasMore: false })
    expect(page.tasks[0].task).toBe('a')
  })

  it('maps a rejected key to unauthorized', async () => {
    stubFetch({ ok: false, error: 'unauthorized' })
    const e = await listTasks(FAKE_CONN).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(SheetError)
    expect((e as SheetError).kind).toBe('unauthorized')
    expect((e as SheetError).unauthorized).toBe(true)
  })

  it('treats an HTML page (Google sign-in) as an access problem', async () => {
    stubFetch('<html>Sign in</html>')
    const e = (await listTasks(FAKE_CONN).catch((x: unknown) => x)) as SheetError
    expect(e.kind).toBe('access')
  })

  it('passes script errors through as server errors', async () => {
    stubFetch({ ok: false, error: 'no_sheet' })
    const e = (await listTasks(FAKE_CONN).catch((x: unknown) => x)) as SheetError
    expect(e.kind).toBe('server')
    expect(e.message).toBe('no_sheet')
  })

  it('never sends the key to a non Apps Script URL', async () => {
    const spy = stubFetch({ ok: true, list: [], total: 0, hasMore: false })
    const e = (await listTasks({ url: 'https://evil.example/exec', key: 'k' }).catch((x: unknown) => x)) as SheetError
    expect(e.kind).toBe('access')
    expect(spy).not.toHaveBeenCalled()
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
    const p = listTasks(FAKE_CONN).catch((x: unknown) => x)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    expect(((await p) as SheetError).kind).toBe('timeout')
  })
})

describe('createTask', () => {
  it('posts JSON as text/plain with the key in the body', async () => {
    const spy = stubFetch({ ok: true, Id: 42 })
    expect(await createTask(FAKE_CONN, '보고서 써 줘', 'idea')).toBe(42)
    const [url, init = {}] = spy.mock.calls[0]
    expect(String(url)).toBe(FAKE_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'text/plain;charset=utf-8' })
    expect(JSON.parse(String(init.body))).toEqual({ action: 'create', task: '보고서 써 줘', category: 'idea', key: FAKE_CONN.key })
  })
})
