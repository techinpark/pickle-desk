import { CATEGORIES, STATUSES, type Category, type Status, type Task } from './types'

// 구글 시트 API 로 작업함 시트를 직접 읽고 쓴다. 피클도 같은 시트를 자기 구글 연동으로 읽고 쓴다.
// 피클은 Tasks!A:H 를 읽고 C:F(Status·Category·Reply·Result)를 고쳐 쓰니 칸 순서는 이대로 고정한다.
export const SHEET_NAME = 'Tasks'
export const HEADERS = ['Id', 'Task', 'Status', 'Category', 'Reply', 'Result', 'CreatedAt', 'UpdatedAt'] as const
export const PAGE_SIZE = 30
/** 응답이 이보다 늦으면 끊는다. 걸린 요청 하나 때문에 폴링이 멈추지 않게. */
export const REQUEST_TIMEOUT_MS = 15_000
/** 앱이 만든 작업함을 다른 기기에서 다시 찾을 때 쓰는 표시(Drive appProperties). */
const APP_PROP = { key: 'pickleDesk', value: 'tasks' }
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'

export interface Connection {
  spreadsheetId: string
  /** 유효한 액세스 토큰. 없으면 SheetError('unauthorized') 를 던진다. */
  token: () => string
}

export type SheetErrorKind = 'unauthorized' | 'forbidden' | 'notFound' | 'quota' | 'network' | 'timeout' | 'server'

export class SheetError extends Error {
  readonly kind: SheetErrorKind
  constructor(kind: SheetErrorKind, message: string = kind) {
    super(message)
    this.kind = kind
  }
  get unauthorized() {
    return this.kind === 'unauthorized'
  }
}

async function api<T>(token: () => string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const bearer = token()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${bearer}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: ctrl.signal,
    })
  } catch (e) {
    throw ctrl.signal.aborted ? new SheetError('timeout') : new SheetError('network', e instanceof Error ? e.message : 'network error')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      // 본문이 JSON 이 아니면 상태 문구를 쓴다
    }
    // 사용자가 Tasks 탭 이름을 바꾸거나 지우면 400 "Unable to parse range" 가 온다.
    const kind: SheetErrorKind =
      res.status === 400 && /parse range/i.test(msg)
        ? 'notFound'
        : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'notFound' : res.status === 429 ? 'quota' : 'server'
    throw new SheetError(kind, msg)
  }
  return (await res.json()) as T
}

// ── 값 읽기 ─────────────────────────────────────────

// 피클이나 사람이 한국어로 적어도 알아듣는다.
const STATUS_ALIASES: Record<string, Status> = {
  대기: 'pending',
  대기중: 'pending',
  '대기 중': 'pending',
  진행: 'running',
  진행중: 'running',
  '진행 중': 'running',
  작업중: 'running',
  '작업 중': 'running',
  완료: 'done',
  끝: 'done',
  실패: 'failed',
  오류: 'failed',
  in_progress: 'running',
  completed: 'done',
  error: 'failed',
}

export function toStatus(v: unknown): Status {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if ((STATUSES as readonly string[]).includes(s)) return s as Status
  return STATUS_ALIASES[s] ?? 'pending'
}

/**
 * 시트 날짜를 ISO 로. 문자열("2026-11-03 16:40:00")과 시트 날짜 일련번호(1899-12-30 부터 일 수, 내 시간대 기준) 둘 다 받는다.
 * Safari 는 공백으로 나눈 형식을 못 읽어서 T 로 바꾼다.
 */
export function normalizeDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // 일련번호를 UTC 로 풀어 날짜·시각 숫자만 얻고, 그 숫자를 내 시간대 시각으로 다시 만든다(1899년 지역 표준시 오차를 피함).
    const u = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86_400_000))
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()).toISOString()
  }
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v.trim().replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 시트에 적는 시각. 피클과 사람이 읽기 쉽게 내 시간대로 적는다. */
export function sheetTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

interface Row {
  /** 시트의 행 번호(1부터, 머리글이 1) */
  row: number
  id: number | null
  task: Task
}

/** 머리글 이름으로 칸을 찾아 행을 읽는다. 빈 행은 건너뛰고, Id 가 없는 행은 id: null 로 둔다. */
export function parseRows(values: unknown[][]): Row[] {
  const [head = [], ...rows] = values
  const col = (name: string) => head.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase())
  const c = Object.fromEntries(HEADERS.map((h) => [h, col(h)])) as Record<(typeof HEADERS)[number], number>
  const at = (r: unknown[], k: keyof typeof c) => (c[k] >= 0 ? r[c[k]] : undefined)
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
  const out: Row[] = []
  rows.forEach((r, i) => {
    const task = str(at(r, 'Task')).trim()
    if (!task) return
    const rawId = Number(at(r, 'Id'))
    const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null
    const category = str(at(r, 'Category')).trim()
    out.push({
      row: i + 2,
      id,
      task: {
        id: id ?? 0,
        task,
        status: toStatus(at(r, 'Status')),
        reply: str(at(r, 'Reply')),
        result: str(at(r, 'Result')),
        category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : 'task',
        createdAt: normalizeDate(at(r, 'CreatedAt')) ?? new Date(0).toISOString(),
        updatedAt: normalizeDate(at(r, 'UpdatedAt')),
      },
    })
  })
  return out
}

const range = (r: string) => encodeURIComponent(`${SHEET_NAME}!${r}`)

async function readRows(conn: Connection): Promise<unknown[][]> {
  const q = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER'
  const data = await api<{ values?: unknown[][] }>(conn.token, `${SHEETS}/${conn.spreadsheetId}/values/${range('A1:H')}?${q}`)
  return data.values ?? []
}

/** 피클이 Id 없이 추가한 행에 Id 를 채워 시트에 적는다. */
async function fillIds(conn: Connection, rows: Row[]) {
  const missing = rows.filter((r) => r.id === null)
  if (missing.length === 0) return
  let next = rows.reduce((m, r) => Math.max(m, r.id ?? 0), 0)
  for (const r of missing) {
    next += 1
    r.id = next
    r.task.id = next
  }
  await api(conn.token, `${SHEETS}/${conn.spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: {
      valueInputOption: 'RAW',
      data: missing.map((r) => ({ range: `${SHEET_NAME}!A${r.row}`, values: [[r.id]] })),
    },
  })
}

export interface Page {
  tasks: Task[]
  total: number
  hasMore: boolean
}

/**
 * Id 내림차순(최신 먼저)으로 돌려준다. beforeId 를 주면 그보다 오래된 것만.
 * 시트 API 는 조건 검색이 없어서 A:H 를 한 번에 읽고 여기서 자른다.
 */
export async function listTasks(conn: Connection, opts: { limit?: number; beforeId?: number } = {}): Promise<Page> {
  const rows = parseRows(await readRows(conn))
  await fillIds(conn, rows)
  const limit = opts.limit ?? PAGE_SIZE
  const older = rows
    .map((r) => r.task)
    .filter((t) => opts.beforeId === undefined || t.id < opts.beforeId)
    .sort((a, b) => b.id - a.id)
  return { tasks: older.slice(0, limit), total: rows.length, hasMore: older.length > limit }
}

export async function createTask(conn: Connection, task: string, category: Category): Promise<number> {
  const ids = await api<{ values?: unknown[][] }>(conn.token, `${SHEETS}/${conn.spreadsheetId}/values/${range('A2:A')}?majorDimension=COLUMNS`)
  const id = (ids.values?.[0] ?? []).reduce<number>((m, v) => Math.max(m, Number(v) || 0), 0) + 1
  // RAW: "=" 로 시작하는 글도 수식이 아닌 글자 그대로 들어간다.
  await api(conn.token, `${SHEETS}/${conn.spreadsheetId}/values/${range('A1:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: { values: [[id, task, 'pending', category, '', '', sheetTime(), '']] },
  })
  return id
}

// ── 작업함 만들기·찾기 ────────────────────────────────

export interface Workbook {
  spreadsheetId: string
  url: string
}

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`

/** 이 계정에서 앱이 예전에 만든 작업함(가장 최근 것)을 찾는다. drive.file 이라 앱이 만든 파일만 보인다. */
export async function findWorkbook(token: () => string): Promise<Workbook | null> {
  const q = `appProperties has { key='${APP_PROP.key}' and value='${APP_PROP.value}' } and trashed = false`
  const data = await api<{ files?: { id: string }[] }>(
    token,
    `${DRIVE}?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=1&fields=files(id)`,
  )
  const id = data.files?.[0]?.id
  return id ? { spreadsheetId: id, url: sheetUrl(id) } : null
}

/** 내 드라이브에 작업함 시트를 만든다: 머리글·첫 줄 고정·상태/분류 드롭다운·넓은 칸, 그리고 다시 찾을 표시. */
export async function createWorkbook(token: () => string, title: string): Promise<Workbook> {
  const created = await api<{ spreadsheetId: string; sheets: { properties: { sheetId: number } }[] }>(token, SHEETS, {
    method: 'POST',
    body: {
      properties: { title },
      sheets: [
        {
          properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1, columnCount: HEADERS.length } },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                { values: HEADERS.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) },
              ],
            },
          ],
        },
      ],
    },
  })
  const { spreadsheetId } = created
  const sheetId = created.sheets[0].properties.sheetId
  const list = (startColumnIndex: number, items: readonly string[]) => ({
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex: startColumnIndex + 1 },
      rule: { condition: { type: 'ONE_OF_LIST', values: items.map((v) => ({ userEnteredValue: v })) }, strict: false, showCustomUi: true },
    },
  })
  const wide = (index: number) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
      properties: { pixelSize: 320 },
      fields: 'pixelSize',
    },
  })
  await api(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests: [list(2, STATUSES), list(3, CATEGORIES), wide(1), wide(4), wide(5)] },
  })
  await api(token, `${DRIVE}/${spreadsheetId}?fields=id`, {
    method: 'PATCH',
    body: { appProperties: { [APP_PROP.key]: APP_PROP.value } },
  })
  return { spreadsheetId, url: sheetUrl(spreadsheetId) }
}
