import { beforeEach, describe, test } from '@e2e-dev/web'
import { expect } from 'e2e'

// 구글 로그인·시트·드라이브 API 를 메모리 안의 가짜로 바꾼다(실제 계정·시트를 건드리지 않음).
type Rec = { Id: number | ''; Task: string; Status: string; Category: string; Reply: string; Result: string; CreatedAt: string; UpdatedAt: string }
const HEADERS = ['Id', 'Task', 'Status', 'Category', 'Reply', 'Result', 'CreatedAt', 'UpdatedAt'] as const
const TOKEN = 'e2e-access-token'
const EMAIL = 'tester@example.com'
const SHEET = 'e2e-sheet'
const KO = `localStorage.setItem('picklejar.settings.v1', JSON.stringify({ locale: 'ko' }))`
const SIGNED_IN = `localStorage.setItem('picklejar.token.v1', JSON.stringify({ accessToken: '${TOKEN}', expiresAt: Date.now() + 3600000, email: '${EMAIL}' }))`
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
}

type Route = {
  request: { method: string; url: string; headers: Record<string, string>; postData: string | null }
  fulfill: (r: { status?: number; headers?: Record<string, string>; json?: unknown }) => Promise<void>
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

function fakeGoogle(seed: Rec[]) {
  const db = [...seed]
  const files: string[] = []
  const api = async (route: Route) => {
    const { method, url, headers, postData } = route.request
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (headers.authorization !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers: CORS, json: { error: { message: 'Invalid Credentials' } } })
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    const body = postData ? JSON.parse(postData) : undefined
    const ok = (json: unknown) => route.fulfill({ headers: CORS, json })
    if (u.hostname === 'openidconnect.googleapis.com') return ok({ email: EMAIL })
    if (u.hostname === 'www.googleapis.com') {
      if (method === 'GET') return ok({ files: files.map((id) => ({ id })) })
      files.push(path.split('/').pop()!)
      return ok({})
    }
    if (path === '/v4/spreadsheets') return ok({ spreadsheetId: SHEET, sheets: [{ properties: { sheetId: 0 } }] })
    if (path.endsWith('/values:batchUpdate')) {
      for (const d of body.data) db[Number(/A(\d+)$/.exec(d.range)![1]) - 2].Id = d.values[0][0]
      return ok({})
    }
    if (path.endsWith(':batchUpdate')) return ok({})
    if (path.endsWith(':append')) {
      const v = body.values[0]
      db.push(Object.fromEntries(HEADERS.map((h, i) => [h, v[i]])) as Rec)
      return ok({})
    }
    if (path.includes('Tasks!A2:A')) return ok({ values: [db.map((r) => r.Id)] })
    return ok({ values: [[...HEADERS], ...db.map((r) => HEADERS.map((h) => r[h]))] })
  }
  // 구글 로그인 화면 대신 바로 앱으로 돌려보낸다(동의했다고 치고).
  const auth = async (route: Route) => {
    const q = new URL(route.request.url).searchParams
    const scope = encodeURIComponent(q.get('scope')!)
    const back = `${q.get('redirect_uri')}#access_token=${TOKEN}&expires_in=3599&token_type=Bearer&state=${q.get('state')}&scope=${scope}`
    return route.fulfill({ status: 302, headers: { location: back } })
  }
  return { db, files, api, auth }
}

describe('pickle jar', () => {
  let g: ReturnType<typeof fakeGoogle>

  beforeEach(async ({ browser }) => {
    g = fakeGoogle([
      { Id: 1, Task: '팀 회식 장소 예약', Status: 'done', Category: 'task', Reply: '2층 룸으로 예약했어요', Result: '예약 완료 · 공지 초안', CreatedAt: now(), UpdatedAt: '' },
      { Id: 2, Task: '새 앱 아이디어 정리', Status: 'running', Category: 'idea', Reply: '', Result: '', CreatedAt: now(), UpdatedAt: '' },
    ])
    await browser.route('https://accounts.google.com/**', g.auth)
    await browser.route('https://sheets.googleapis.com/**', g.api)
    await browser.route('https://www.googleapis.com/**', g.api)
    await browser.route('https://openidconnect.googleapis.com/**', g.api)
  })

  test('처음 사용: 구글 로그인 → 작업함 만들기 → 피클 문장 → 작업 보내기 → 피클 답 반영', async ({ app, screen, browser }) => {
    g.db.length = 0
    await browser.addInitScript(KO)
    await app.open('/')
    await screen.getByTestId('login-google').tap()
    await screen.getByTestId('create-sheet').tap()
    await expect(screen.getByText('피클 연결하기')).toBeVisible()
    await expect(screen.getByTestId('pickle-prompt')).toBeVisible()
    await screen.getByRole('button', '완료').tap()
    await expect(screen.getByText('아직 작업이 없어요')).toBeVisible()

    const box = screen.getByRole('textbox', '피클에게 맡길 일을 적어 주세요')
    await box.fill('내일 회의록 정리해 줘')
    await box.press('Enter')
    await expect(screen.getByText('시트에 적었어요')).toBeVisible()
    expect(g.db.at(-1)).toMatchObject({ Id: 1, Task: '내일 회의록 정리해 줘', Status: 'pending', Category: 'task' })

    // 피클이 시트에 답을 적으면 폴링으로 반영된다(테스트는 5초 주기)
    const rec = g.db.at(-1)!
    rec.Status = '완료'
    rec.Reply = '회의록을 정리해 뒀어요'
    await expect(screen.getByText('회의록을 정리해 뒀어요')).toBeVisible({ timeout: 15_000 })

    // 새로고침해도 로그인과 작업함이 유지된다
    await browser.reload()
    await expect(screen.getByText('회의록을 정리해 뒀어요')).toBeVisible()
  })

  test('다른 기기: 예전에 만든 작업함을 찾아 쓰고, 피클이 Id 없이 추가한 행도 보인다', async ({ app, screen, browser }) => {
    g.files.push(SHEET)
    g.db.push({ Id: '', Task: '오늘 날씨 알림', Status: 'done', Category: 'task', Reply: '오후에 비가 와요', Result: '', CreatedAt: now(), UpdatedAt: '' })
    await browser.addInitScript(`${SIGNED_IN}; ${KO}`)
    await app.open('/')
    await expect(screen.getByText('오후에 비가 와요')).toBeVisible()
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
    expect(g.db.at(-1)!.Id).toBe(3)
  })

  test('프리셋 원클릭 등록과 상태 필터', async ({ app, screen, browser }) => {
    g.files.push(SHEET)
    await browser.addInitScript(`${SIGNED_IN}; ${KO}`)
    await app.open('/')
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()

    await screen.getByTestId('preset-briefing').tap()
    await expect(screen.getByText('오늘 아침 브리핑 보여 줘')).toBeVisible()
    expect(g.db.at(-1)).toMatchObject({ Category: 'briefing', Status: 'pending' })

    await screen.getByRole('button', /^완료/).tap()
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
    await expect(screen.getByText('오늘 아침 브리핑 보여 줘')).toBeHidden()
  })

  test('설정: 주기·언어 저장, 피클 문장, 로그아웃', async ({ app, screen, browser }) => {
    g.files.push(SHEET)
    await browser.addInitScript(`if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); ${SIGNED_IN}; ${KO} }`)
    await app.open('/')
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
    await screen.getByTestId('open-settings').tap()
    await expect(screen.getByText(EMAIL)).toBeVisible()
    await screen.getByRole('button', '연결 확인').tap()
    await expect(screen.getByText('연결됨 · 작업 2개')).toBeVisible()
    await screen.getByRole('radio', '10초').tap()
    await screen.getByRole('radio', 'English').tap()
    await screen.getByTestId('save-settings').tap()
    await expect(screen.getByText('Connected')).toBeVisible()

    await screen.getByTestId('open-settings').tap()
    await screen.getByTestId('open-pickle').tap()
    await expect(screen.getByTestId('pickle-prompt')).toBeVisible()
    await screen.getByRole('button', 'Done').tap()

    await screen.getByTestId('open-settings').tap()
    await screen.getByRole('button', 'Sign out').tap()
    await expect(screen.getByRole('button', 'Continue with Google')).toBeVisible()
  })
})
