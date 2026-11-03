import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { KEY } from './lib/settings'
import { nav } from './lib/google'
import { FAKE_EMAIL, FAKE_SHEET_ID, FAKE_TOKEN, fakeSheet, storeFakeSession } from './test/fakeSheet'

function connected(extra: Record<string, unknown> = {}) {
  localStorage.setItem(KEY, JSON.stringify({ locale: 'ko', ...extra }))
  storeFakeSession()
}

/** 구글에서 돌아온 상태를 꾸민다: 시작할 때 저장한 state 와 #access_token 이 붙은 주소. */
function returnFromGoogle(hash: (state: string) => string) {
  sessionStorage.setItem('picklejar.oauth.state', 'st')
  history.replaceState(null, '', `/${hash('st')}`)
}
const tokenHash = (state: string) =>
  `#access_token=${FAKE_TOKEN}&expires_in=3599&state=${state}&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file openid email')}`

let went: string[] = []
beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, languages: ['ko-KR'], clipboard: { writeText: vi.fn(async () => {}) } })
  went = []
  vi.spyOn(nav, 'go').mockImplementation((url) => void went.push(url))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
})

describe('sign-in and setup', () => {
  it('shows the Google sign-in screen and starts the redirect', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { fetchMock } = fakeSheet()
    render(<App />)
    await userEvent.click(await screen.findByTestId('login-google'))
    expect(went).toHaveLength(1)
    const u = new URL(went[0])
    expect(u.hostname).toBe('accounts.google.com')
    expect(u.searchParams.get('state')).toBe(sessionStorage.getItem('picklejar.oauth.state'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('after returning from Google with no sheet yet, creates one and shows the Pickle message', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { state } = fakeSheet()
    returnFromGoogle(tokenHash)
    render(<App />)
    await userEvent.click(await screen.findByTestId('create-sheet'))
    expect(state.created).toHaveLength(1)
    const prompt = (await screen.findByTestId('pickle-prompt')) as HTMLTextAreaElement
    expect(prompt.value).toContain('https://docs.google.com/spreadsheets/d/new-sheet/edit')
    expect(window.location.hash).toBe('')
    await userEvent.click(screen.getByTestId('copy-prompt'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('5분마다 Tasks 탭을 확인해서'))
    expect(screen.getByText('복사했어요. 피클에게 붙여 넣으세요.')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료' }))
    expect(await screen.findByText('아직 작업이 없어요')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('picklejar.token.v1')!)).toMatchObject({ accessToken: FAKE_TOKEN, email: FAKE_EMAIL })
  })

  it('signs in on the first try even when the startup effect runs twice (StrictMode)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet()
    returnFromGoogle(tokenHash)
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    expect(await screen.findByTestId('create-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('login-google')).not.toBeInTheDocument()
  })

  it('reuses the sheet it made before on a new device', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { state } = fakeSheet([{ Task: '예전 작업' }])
    state.files = [FAKE_SHEET_ID]
    storeFakeSession({ workbook: false })
    render(<App />)
    expect(await screen.findByText('예전 작업')).toBeInTheDocument()
    expect(state.created).toHaveLength(0)
  })

  it('keeps the session after a reload', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.queryByTestId('login-google')).not.toBeInTheDocument()
  })

  it('refreshes an expired token silently, then gives up and asks to sign in', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet()
    storeFakeSession({ expired: true })
    const { unmount } = render(<App />)
    await waitFor(() => expect(went).toHaveLength(1))
    const u = new URL(went[0])
    expect(u.searchParams.get('prompt')).toBe('none')
    expect(u.searchParams.get('login_hint')).toBe(FAKE_EMAIL)
    unmount()
    // 구글이 조용한 로그인을 거절하고 돌아왔다
    returnFromGoogle((st) => `#error=interaction_required&state=${st}`)
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('로그아웃됐어요')
    expect(went).toHaveLength(1)
  })

  it('ignores a token whose state does not match', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet()
    sessionStorage.setItem('picklejar.oauth.state', 'mine')
    history.replaceState(null, '', `/${tokenHash('forged')}`)
    render(<App />)
    expect(await screen.findByTestId('login-google')).toBeInTheDocument()
    expect(localStorage.getItem('picklejar.token.v1')).toBeNull()
  })

  it('explains a denied Google permission', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet()
    returnFromGoogle((st) => `#error=access_denied&state=${st}`)
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('구글 권한을 허용하지 않았어요')
  })
})

describe('timeline', () => {
  it('renders status badges, reply bubbles, results and the empty waiting state', async () => {
    connected()
    fakeSheet([
      { Task: 'A', Status: 'pending' },
      { Task: 'B', Status: 'running' },
      { Task: 'C', Status: 'done', Reply: '끝냈어요', Result: '결과 본문', Category: 'briefing' },
      { Task: 'D', Status: 'failed', Reply: '실패했어요' },
    ])
    render(<App />)
    await screen.findByText('A')
    const badges = screen.getAllByTestId('status-badge').map((b) => b.dataset.status)
    expect(badges).toEqual(['pending', 'running', 'done', 'failed'])
    expect(screen.getByText('피클이 아직 확인하지 않았어요')).toBeInTheDocument()
    expect(screen.getByText('피클이 작업하고 있어요')).toBeInTheDocument()
    expect(screen.getByText('결과 본문')).toBeInTheDocument()
    expect(within(screen.getAllByTestId('task-item')[2]).getByText('브리핑')).toBeInTheDocument()
    expect(screen.getByTestId('conn-state')).toHaveAttribute('data-state', 'online')
  })

  it('filters by status', async () => {
    connected()
    fakeSheet([
      { Task: 'A', Status: 'pending' },
      { Task: 'C', Status: 'done' },
    ])
    render(<App />)
    await screen.findByText('A')
    const nav = screen.getByRole('navigation', { name: '상태 필터' })
    await userEvent.click(within(nav).getByRole('button', { name: /완료/ }))
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: /실패/ }))
    expect(screen.getByText('이 상태의 작업이 없어요')).toBeInTheDocument()
  })

  it('shows the empty state for a new table', async () => {
    connected()
    fakeSheet([])
    render(<App />)
    expect(await screen.findByText('아직 작업이 없어요')).toBeInTheDocument()
  })

  it('loads older pages on demand', async () => {
    connected()
    const recs = Array.from({ length: 35 }, (_, i) => ({
      Task: `job ${i}`,
      CreatedAt: `2026-10-27 ${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00+00:00`,
    }))
    fakeSheet(recs)
    render(<App />)
    await screen.findByText('job 34')
    expect(screen.queryByText('job 0')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('이전 작업 더 보기'))
    expect(await screen.findByText('job 0')).toBeInTheDocument()
    expect(screen.getAllByTestId('task-item')).toHaveLength(35)
    expect(screen.queryByText('이전 작업 더 보기')).not.toBeInTheDocument()
  })

  it('linkifies urls in replies safely', async () => {
    connected()
    fakeSheet([{ Task: 'x', Status: 'done', Reply: '여기 https://example.com 확인' }])
    render(<App />)
    const link = await screen.findByRole('link', { name: 'https://example.com' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('polling', () => {
  it('picks up Pickle replies on the next poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected({ pollSeconds: 5 })
    const { db } = fakeSheet([{ Task: '아침 브리핑', Status: 'pending' }])
    render(<App />)
    await screen.findByText('아침 브리핑')
    db[0].Status = 'done'
    db[0].Reply = '브리핑 준비했어요'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })
    expect(await screen.findByText('브리핑 준비했어요')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', 'done')
  })

  it('refreshes the token silently, and stops polling, when Google rejects it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected()
    const { fetchMock, state } = fakeSheet()
    state.reject = true
    render(<App />)
    expect(await screen.findByText(/구글 로그인이 만료됐어요/)).toBeInTheDocument()
    await waitFor(() => expect(went).toHaveLength(1))
    expect(new URL(went[0]).searchParams.get('prompt')).toBe('none')
    expect(screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' })).toBeDisabled()
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('offers to set up again when the sheet was deleted', async () => {
    connected()
    const { state } = fakeSheet([{ Task: 'A' }])
    state.missing = true
    render(<App />)
    expect(await screen.findByText(/작업함 시트가 지워졌거나/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 설정' }))
    expect(await screen.findByTestId('create-sheet')).toBeInTheDocument()
  })

  it('shows a retry banner while offline and recovers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected({ pollSeconds: 5 })
    const { state } = fakeSheet([{ Task: 'A' }])
    state.offline = true
    render(<App />)
    expect(await screen.findByText(/자동으로 다시 시도/)).toBeInTheDocument()
    state.offline = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })
    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.queryByText(/자동으로 다시 시도/)).not.toBeInTheDocument()
  })
})

describe('composer', () => {
  it('sends on Enter as a pending task and clears the input', async () => {
    connected()
    const { db } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    const box = screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' })
    await userEvent.type(box, '회의록 정리해 줘{Enter}')
    await waitFor(() => expect(db).toHaveLength(1))
    expect(db[0]).toMatchObject({ Task: '회의록 정리해 줘', Status: 'pending', Category: 'task' })
    expect(box).toHaveValue('')
    expect(await screen.findByText('회의록 정리해 줘')).toBeInTheDocument()
    expect(screen.getByText('시트에 적었어요')).toBeInTheDocument()
  })

  it('does not send on Shift+Enter or while composing Korean', async () => {
    connected()
    const { db } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    const box = screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' })
    await userEvent.type(box, '첫 줄{Shift>}{Enter}{/Shift}둘째')
    expect(box).toHaveValue('첫 줄\n둘째')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true, keyCode: 229 })
    await new Promise((r) => setTimeout(r, 20))
    expect(db).toHaveLength(0)
  })

  it('ignores blank input', async () => {
    connected()
    const { db } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    await userEvent.type(screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' }), '   {Enter}')
    expect(db).toHaveLength(0)
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
  })

  it('uses the chosen category', async () => {
    connected()
    const { db } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    await userEvent.click(screen.getByRole('radio', { name: '아이디어' }))
    await userEvent.type(screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' }), '새 앱 아이디어{Enter}')
    await waitFor(() => expect(db[0]?.Category).toBe('idea'))
  })

  it('creates preset quick actions in one click', async () => {
    connected()
    const { db } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    await userEvent.click(screen.getByTestId('preset-mail'))
    await userEvent.click(screen.getByTestId('preset-briefing'))
    await waitFor(() => expect(db).toHaveLength(2))
    expect(db[0]).toMatchObject({ Task: '오늘 안 읽은 메일 요약해 줘', Category: 'quick_action', Status: 'pending' })
    expect(db[1]).toMatchObject({ Category: 'briefing' })
  })

  it('keeps the text and shows an error when sending fails', async () => {
    connected()
    const { state } = fakeSheet([])
    render(<App />)
    await screen.findByText('아직 작업이 없어요')
    state.offline = true
    const box = screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' })
    await userEvent.type(box, '중요한 일{Enter}')
    expect(await screen.findByText(/보내지 못했어요/)).toBeInTheDocument()
    expect(box).toHaveValue('중요한 일')
  })
})

describe('settings', () => {
  it('saves poll interval, language and theme', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: '10초' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'English' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: '다크' }))
    await userEvent.click(screen.getByTestId('save-settings'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved).toEqual({ pollSeconds: 10, locale: 'en', theme: 'dark' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('textbox', { name: 'Ask Pickle to do something' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('tests the connection from settings', async () => {
    connected()
    fakeSheet([{ Task: 'A' }, { Task: 'B' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(screen.getByRole('button', { name: '연결 확인' }))
    expect(await screen.findByText('연결됨 · 작업 2개')).toBeInTheDocument()
  })

  it('closes on Escape without saving', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: '30초' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!).pollSeconds).not.toBe(30)
  })

  it('opens the Pickle message from settings', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(screen.getByTestId('open-pickle'))
    expect((screen.getByTestId('pickle-prompt') as HTMLTextAreaElement).value).toContain(`/d/${FAKE_SHEET_ID}/edit`)
  })

  it('shows the signed-in account and signs out', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    expect(screen.getByTestId('account')).toHaveTextContent(FAKE_EMAIL)
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(await screen.findByTestId('login-google')).toBeInTheDocument()
    expect(localStorage.getItem('picklejar.token.v1')).toBeNull()
    expect(localStorage.getItem('picklejar.workbook.v1')).toBeNull()
  })
})

// jsdom 은 레이아웃이 없어서, 작업 카드·답변 말풍선 수로 문서 높이를 흉내 낸다.
describe('scrolling', () => {
  const saved = {
    scrollHeight: Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight'),
    scrollY: Object.getOwnPropertyDescriptor(window, 'scrollY'),
    innerHeight: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
    scrollTo: window.scrollTo,
  }
  afterEach(() => {
    for (const [obj, key] of [
      [document.documentElement, 'scrollHeight'],
      [window, 'scrollY'],
      [window, 'innerHeight'],
    ] as const) {
      const d = saved[key]
      if (d) Object.defineProperty(obj, key, d)
      else delete (obj as unknown as Record<string, unknown>)[key]
    }
    window.scrollTo = saved.scrollTo
  })

  function fakeLayout() {
    const pos = { y: 0 }
    const height = () =>
      document.querySelectorAll('[data-testid="task-item"]').length * 400 +
      document.querySelectorAll('.bubble:not(.bubble-waiting)').length * 300
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: height })
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => pos.y })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const clampTo = (y: number) => {
      pos.y = Math.max(0, Math.min(y, height() - 800))
      window.dispatchEvent(new Event('scroll'))
    }
    window.scrollTo = ((o: ScrollToOptions) => clampTo(o.top ?? 0)) as typeof window.scrollTo
    const atLatest = () => waitFor(() => expect(pos.y).toBe(height() - 800))
    return { pos, height, userScroll: clampTo, atLatest }
  }

  const poll = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

  it('follows a long reply that arrives while the reader is at the bottom', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected({ pollSeconds: 5 })
    const { db } = fakeSheet([{ Task: 'A' }, { Task: 'B' }, { Task: 'C' }])
    const layout = fakeLayout()
    render(<App />)
    await screen.findByText('C')
    await waitFor(() => expect(layout.pos.y).toBe(layout.height() - 800))
    db[2].Status = 'done'
    db[2].Reply = '아주 긴 답변'
    await poll()
    await screen.findByText('아주 긴 답변')
    expect(layout.pos.y).toBe(layout.height() - 800)
  })

  it('stays put when the reader has scrolled up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected({ pollSeconds: 5 })
    const { db } = fakeSheet([{ Task: 'A' }, { Task: 'B' }, { Task: 'C' }])
    const layout = fakeLayout()
    render(<App />)
    await screen.findByText('C')
    await layout.atLatest()
    act(() => layout.userScroll(0))
    db[2].Reply = '답변'
    await poll()
    await screen.findByText('답변')
    expect(layout.pos.y).toBe(0)
  })

  it('keeps the reading position when older tasks load above', async () => {
    connected()
    fakeSheet(Array.from({ length: 35 }, (_, i) => ({ Task: `job ${i}` })))
    const layout = fakeLayout()
    render(<App />)
    await screen.findByText('job 34')
    await layout.atLatest()
    act(() => layout.userScroll(0))
    await userEvent.click(screen.getByText('이전 작업 더 보기'))
    await screen.findByText('job 0')
    // 위에 5개(400px씩)가 붙었으니 같은 카드를 보려면 2000px 내려가 있어야 한다.
    expect(layout.pos.y).toBe(2000)
  })

  it('jumps to the latest again after switching to a new sheet', async () => {
    connected()
    const { state } = fakeSheet(Array.from({ length: 6 }, (_, i) => ({ Task: `job ${i}` })))
    const layout = fakeLayout()
    render(<App />)
    await screen.findByText('job 5')
    await layout.atLatest()
    act(() => layout.userScroll(0))
    state.missing = true
    act(() => void document.dispatchEvent(new Event('visibilitychange'))) // 다시 보이면 바로 새로고침
    await userEvent.click(await screen.findByRole('button', { name: '다시 설정' }))
    state.missing = false
    await userEvent.click(await screen.findByTestId('create-sheet'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '완료' }))
    await screen.findByText('job 5')
    await waitFor(() => expect(layout.pos.y).toBe(layout.height() - 800))
  })
})
