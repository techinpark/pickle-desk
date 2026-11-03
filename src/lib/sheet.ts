import { CATEGORIES, STATUSES, type Category, type Status, type Task } from './types'

// 구글 시트에 붙인 Apps Script 웹 앱(apps-script/Code.gs)을 부른다.
// 사용자 정의 헤더를 붙이면 CORS 사전 요청이 생기는데 Apps Script 는 그걸 받지 못해서,
// 키는 쿼리·본문에 넣고 POST 는 text/plain 으로 보낸다.
export const PAGE_SIZE = 30
/** 응답이 이보다 늦으면 끊는다. Apps Script 는 첫 호출이 몇 초 걸리기도 해서 넉넉히 둔다. */
export const REQUEST_TIMEOUT_MS = 20_000

export interface Connection {
  /** https://script.google.com/macros/s/…/exec */
  url: string
  key: string
}

export type SheetErrorKind = 'unauthorized' | 'access' | 'network' | 'timeout' | 'server'

export class SheetError extends Error {
  readonly kind: SheetErrorKind
  constructor(kind: SheetErrorKind, message: string = kind) {
    super(message)
    this.kind = kind
  }
  get unauthorized() {
    return this.kind === 'unauthorized' || this.kind === 'access'
  }
}

interface RawRecord {
  Id: number
  Task?: string | null
  Status?: string | null
  Reply?: string | null
  Result?: string | null
  Category?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
}

export function toTask(r: RawRecord): Task {
  const status = (STATUSES as readonly string[]).includes(r.Status ?? '') ? (r.Status as Status) : 'pending'
  const category = (CATEGORIES as readonly string[]).includes(r.Category ?? '') ? (r.Category as Category) : 'task'
  return {
    id: r.Id,
    task: r.Task ?? '',
    status,
    reply: r.Reply ?? '',
    result: r.Result ?? '',
    category,
    createdAt: normalizeDate(r.CreatedAt) ?? new Date(0).toISOString(),
    updatedAt: normalizeDate(r.UpdatedAt),
  }
}

// 시트에 사람이 "2026-10-28 01:12:22" 처럼 적을 수도 있다. Safari 는 공백으로 나눈 형식을 못 읽는다.
export function normalizeDate(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 웹 앱 주소로 보이는지. 다른 곳으로 키를 보내지 않게 막는다. */
export function isScriptUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)
  } catch {
    return false
  }
}

type Reply<T> = ({ ok: true } & T) | { ok: false; error: string }

async function call<T>(conn: Connection, init: { query?: Record<string, string>; body?: Record<string, unknown> }) {
  if (!isScriptUrl(conn.url)) throw new SheetError('access', 'bad url')
  const url = new URL(conn.url)
  if (init.query) for (const [k, v] of Object.entries({ ...init.query, key: conn.key })) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: init.body ? 'POST' : 'GET',
      body: init.body ? JSON.stringify({ ...init.body, key: conn.key }) : undefined,
      headers: init.body ? { 'content-type': 'text/plain;charset=utf-8' } : undefined,
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl.signal,
    })
  } catch (e) {
    // 액세스 권한이 "모든 사용자"가 아니면 구글 로그인 페이지로 넘어가며 CORS 에 막혀 여기로 온다.
    throw ctrl.signal.aborted ? new SheetError('timeout') : new SheetError('network', e instanceof Error ? e.message : 'network error')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new SheetError(res.status === 401 || res.status === 403 ? 'access' : 'server', res.statusText)
  let data: Reply<T>
  try {
    data = (await res.json()) as Reply<T>
  } catch {
    // JSON 대신 HTML(로그인·오류 페이지)이 왔다.
    throw new SheetError('access', 'not json')
  }
  if (!data.ok) throw new SheetError(data.error === 'unauthorized' ? 'unauthorized' : 'server', data.error)
  return data
}

export interface Page {
  tasks: Task[]
  total: number
  hasMore: boolean
}

/**
 * Id 내림차순(최신 먼저)으로 가져온다. beforeId 를 주면 그보다 오래된 것만 받는다.
 * offset 대신 Id 기준으로 넘겨서, 그사이 새 작업이 생기거나 지워져도 페이지가 밀리지 않는다.
 */
export async function listTasks(conn: Connection, opts: { limit?: number; beforeId?: number } = {}): Promise<Page> {
  const query: Record<string, string> = { action: 'list', limit: String(opts.limit ?? PAGE_SIZE) }
  if (opts.beforeId !== undefined) query.beforeId = String(opts.beforeId)
  const data = await call<{ list: RawRecord[]; total: number; hasMore: boolean }>(conn, { query })
  const tasks = data.list.map(toTask)
  return { tasks, total: data.total ?? tasks.length, hasMore: data.hasMore === true }
}

export async function createTask(conn: Connection, task: string, category: Category): Promise<number> {
  const data = await call<{ Id: number }>(conn, { body: { action: 'create', task, category } })
  return data.Id
}
