import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { KEY } from './lib/settings'
import { CONN_KEY } from './lib/connection'
import { FAKE_SHEET_KEY, FAKE_URL, fakeSheet, storeFakeConnection } from './test/fakeSheet'

function connected(extra: Record<string, unknown> = {}) {
  localStorage.setItem(KEY, JSON.stringify({ locale: 'ko', ...extra }))
  storeFakeConnection()
}

async function connectByForm(url = FAKE_URL, key = FAKE_SHEET_KEY) {
  await userEvent.type(await screen.findByTestId('connect-url'), url)
  await userEvent.type(screen.getByTestId('connect-key'), key)
  await userEvent.click(screen.getByTestId('connect-submit'))
}

beforeEach(() => vi.stubGlobal('navigator', { ...navigator, languages: ['ko-KR'] }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

describe('connect', () => {
  it('shows the connect screen and opens the timeline after a valid URL and key', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { fetchMock } = fakeSheet([{ Task: '회식 장소 예약', Status: 'done', Reply: '예약했어요' }])
    render(<App />)
    expect(await screen.findByText('구글 시트 연결하기')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await connectByForm()
    expect(await screen.findByText('회식 장소 예약')).toBeInTheDocument()
    expect(screen.getByText('예약했어요')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(CONN_KEY)!)).toEqual({ url: FAKE_URL, key: FAKE_SHEET_KEY })
  })

  it('keeps the connection after a reload', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.queryByTestId('connect-submit')).not.toBeInTheDocument()
  })

  it('connects from the sheet menu link and removes the key from the address bar', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet([{ Task: 'A' }])
    history.replaceState(null, '', `/#connect?u=${encodeURIComponent(FAKE_URL)}&k=${FAKE_SHEET_KEY}`)
    render(<App />)
    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(localStorage.getItem(CONN_KEY)).toContain(FAKE_SHEET_KEY)
  })

  it('splits a pasted connect link into URL and key', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    const link = `https://example.github.io/pickle-jar/#connect?u=${encodeURIComponent(FAKE_URL)}&k=${FAKE_SHEET_KEY}`
    fireEvent.change(await screen.findByTestId('connect-url'), { target: { value: link } })
    expect(screen.getByTestId('connect-url')).toHaveValue(FAKE_URL)
    expect(screen.getByTestId('connect-key')).toHaveValue(FAKE_SHEET_KEY)
    await userEvent.click(screen.getByTestId('connect-submit'))
    expect(await screen.findByText('A')).toBeInTheDocument()
  })

  it('rejects a URL that is not an Apps Script web app without calling it', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { fetchMock } = fakeSheet()
    render(<App />)
    await connectByForm('https://docs.google.com/spreadsheets/d/abc/edit')
    expect(await screen.findByRole('alert')).toHaveTextContent('웹 앱 주소 형식이 아니에요')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a wrong key and a web app that is not open to anyone', async () => {
    localStorage.setItem(KEY, JSON.stringify({ locale: 'ko' }))
    const { state } = fakeSheet()
    render(<App />)
    await connectByForm(FAKE_URL, 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('시트가 이 키를 거부했어요')
    state.html = true
    await userEvent.click(screen.getByTestId('connect-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('모든 사용자')
    expect(localStorage.getItem(CONN_KEY)).toBeNull()
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

  it('shows a banner, disables input and stops polling when the sheet rejects the key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    connected()
    const { fetchMock, state } = fakeSheet()
    state.reject = true
    render(<App />)
    expect(await screen.findByText(/시트가 연결 키를 거부했어요/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '피클에게 맡길 일을 적어 주세요' })).toBeDisabled()
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(fetchMock.mock.calls.length).toBe(calls)
    await userEvent.click(screen.getByRole('button', { name: '다시 연결' }))
    expect(screen.getByTestId('connect-url')).toHaveValue(FAKE_URL)
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

  it('shows the connected sheet and disconnects', async () => {
    connected()
    fakeSheet([{ Task: 'A' }])
    render(<App />)
    await screen.findByText('A')
    await userEvent.click(screen.getByTestId('open-settings'))
    expect(screen.getByTestId('account')).toHaveTextContent(FAKE_URL)
    await userEvent.click(screen.getByRole('button', { name: '연결 끊기' }))
    expect(await screen.findByTestId('connect-submit')).toBeInTheDocument()
    expect(localStorage.getItem(CONN_KEY)).toBeNull()
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

  it('jumps to the latest again after reconnecting', async () => {
    connected()
    fakeSheet(Array.from({ length: 6 }, (_, i) => ({ Task: `job ${i}` })))
    const layout = fakeLayout()
    render(<App />)
    await screen.findByText('job 5')
    await layout.atLatest()
    act(() => layout.userScroll(0))
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(screen.getByRole('button', { name: '연결 끊기' }))
    await connectByForm()
    await screen.findByText('job 5')
    await waitFor(() => expect(layout.pos.y).toBe(layout.height() - 800))
  })
})
