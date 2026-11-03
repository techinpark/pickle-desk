import { beforeEach, describe, test } from '@e2e-dev/web'
import { expect } from 'e2e'

// 메모리 안의 가짜 Apps Script 웹 앱. script.google.com 으로 가는 요청을 가로챈다(실제 시트를 건드리지 않음).
type Rec = { Id: number; Task: string; Status: string; Reply: string | null; Result: string | null; Category: string; CreatedAt: string }
const URL_ = 'https://script.google.com/macros/s/AKfakeE2E/exec'
const KEY = 'e2e-sheet-key'
const CONNECTED = `localStorage.setItem('picklejar.connection.v1', JSON.stringify({ url: '${URL_}', key: '${KEY}' }))`
const KO = `localStorage.setItem('picklejar.settings.v1', JSON.stringify({ locale: 'ko' }))`
const CORS = { 'access-control-allow-origin': '*' }

function fake(seed: Rec[]) {
  const db = [...seed]
  let next = 1000
  return {
    db,
    handler: async (route: {
      request: { method: string; url: string; postData: string | null }
      fulfill: (r: { status?: number; headers?: Record<string, string>; json?: unknown }) => Promise<void>
    }) => {
      const { method, url, postData } = route.request
      const p: Record<string, string> = method === 'POST' ? JSON.parse(postData ?? '{}') : Object.fromEntries(new URL(url).searchParams)
      if (p.key !== KEY) return route.fulfill({ headers: CORS, json: { ok: false, error: 'unauthorized' } })
      if (p.action === 'create') {
        const rec = { Id: next++, Task: p.task, Status: 'pending', Category: p.category, Reply: null, Result: null, CreatedAt: new Date().toISOString() }
        db.push(rec)
        return route.fulfill({ headers: CORS, json: { ok: true, Id: rec.Id } })
      }
      const list = [...db].sort((a, b) => b.Id - a.Id)
      return route.fulfill({ headers: CORS, json: { ok: true, list, total: db.length, hasMore: false } })
    },
  }
}

const now = () => new Date().toISOString()

describe('pickle jar', () => {
  let sheet: ReturnType<typeof fake>

  beforeEach(async ({ browser }) => {
    sheet = fake([
      { Id: 1, Task: '팀 회식 장소 예약', Status: 'done', Reply: '2층 룸으로 예약했어요', Result: '예약 완료 · 공지 초안', Category: 'task', CreatedAt: now() },
      { Id: 2, Task: '새 앱 아이디어 정리', Status: 'running', Reply: null, Result: null, Category: 'idea', CreatedAt: now() },
    ])
    await browser.route('https://script.google.com/macros/s/**', sheet.handler)
  })

  test('연결 링크로 열기 → 작업 보내기 → 피클 답변 반영', async ({ app, screen, browser }) => {
    await browser.addInitScript(KO)
    await app.open(`/#connect?u=${encodeURIComponent(URL_)}&k=${KEY}`)
    await expect(screen.getByText('2층 룸으로 예약했어요')).toBeVisible()
    await expect(screen.getByText('피클이 작업하고 있어요')).toBeVisible()
    await expect(screen.getByTestId('conn-state')).toHaveText('연결됨')

    const box = screen.getByRole('textbox', '피클에게 맡길 일을 적어 주세요')
    await box.fill('내일 회의록 정리해 줘')
    await box.press('Enter')
    await expect(screen.getByText('시트에 적었어요')).toBeVisible()
    await expect(screen.getByText('내일 회의록 정리해 줘')).toBeVisible()
    expect(sheet.db.at(-1)).toMatchObject({ Task: '내일 회의록 정리해 줘', Status: 'pending', Category: 'task' })

    // 피클이 시트에 답을 적으면 폴링(기본 5초)으로 반영된다
    const rec = sheet.db.at(-1)!
    rec.Status = 'done'
    rec.Reply = '회의록을 정리해 뒀어요'
    await expect(screen.getByText('회의록을 정리해 뒀어요')).toBeVisible({ timeout: 12_000 })

    // 새로고침해도 연결이 유지된다(주소창의 키는 지워졌다)
    await browser.reload()
    await expect(screen.getByText('회의록을 정리해 뒀어요')).toBeVisible()
  })

  test('주소와 키를 직접 입력해 연결', async ({ app, screen, browser }) => {
    await browser.addInitScript(KO)
    await app.open('/')
    await expect(screen.getByText('구글 시트 연결하기')).toBeVisible()
    await screen.getByTestId('connect-url').fill(URL_)
    await screen.getByTestId('connect-key').fill('wrong')
    await screen.getByTestId('connect-submit').tap()
    await expect(screen.getByText('시트가 이 키를 거부했어요', { exact: false })).toBeVisible()
    await screen.getByTestId('connect-key').fill(KEY)
    await screen.getByTestId('connect-submit').tap()
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
  })

  test('프리셋 원클릭 등록과 상태 필터', async ({ app, screen, browser }) => {
    await browser.addInitScript(`${CONNECTED}; ${KO}`)
    await app.open('/')
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()

    await screen.getByTestId('preset-briefing').tap()
    await expect(screen.getByText('오늘 아침 브리핑 보여 줘')).toBeVisible()
    expect(sheet.db.at(-1)).toMatchObject({ Category: 'briefing', Status: 'pending' })

    await screen.getByRole('button', /^완료/).tap()
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
    await expect(screen.getByText('오늘 아침 브리핑 보여 줘')).toBeHidden()
  })

  test('설정: 주기·언어 저장, 연결 끊기', async ({ app, screen, browser }) => {
    await browser.addInitScript(`if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); ${CONNECTED}; ${KO} }`)
    await app.open('/')
    await expect(screen.getByText('팀 회식 장소 예약')).toBeVisible()
    await screen.getByTestId('open-settings').tap()
    await expect(screen.getByRole('dialog')).toBeVisible()
    await screen.getByRole('button', '연결 확인').tap()
    await expect(screen.getByText('연결됨 · 작업 2개')).toBeVisible()
    await screen.getByRole('radio', '10초').tap()
    await screen.getByRole('radio', 'English').tap()
    await screen.getByTestId('save-settings').tap()
    await expect(screen.getByText('Connected')).toBeVisible()

    await screen.getByTestId('open-settings').tap()
    await expect(screen.getByText(URL_)).toBeVisible()
    await screen.getByRole('button', 'Disconnect').tap()
    await expect(screen.getByRole('button', 'Connect')).toBeVisible()
  })
})
