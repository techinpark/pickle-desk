// 어제 GA4 사용자 수를 디스코드로 보낸다. GitHub Actions 가 매일 아침 부른다(.github/workflows/daily-stats.yml).
// 필요한 환경 변수: GA_SA_KEY(속성 뷰어 권한의 서비스 계정 JSON 키), GA_PROPERTY_ID, DISCORD_WEBHOOK.
// DRY_RUN=1 이면 디스코드에 보내지 않고 메시지만 출력한다.
import { createSign } from 'node:crypto'

const { GA_SA_KEY, GA_PROPERTY_ID, DISCORD_WEBHOOK, DRY_RUN } = process.env
if (!GA_SA_KEY || !GA_PROPERTY_ID || (!DISCORD_WEBHOOK && !DRY_RUN)) {
  console.error('GA_SA_KEY, GA_PROPERTY_ID, DISCORD_WEBHOOK 이 필요함')
  process.exit(1)
}

const EVENTS = [
  ['login', '로그인'],
  ['sheet_create', '작업함 만들기'],
  ['onboarding_done', '온보딩 끝'],
  ['task_send', '작업 보내기'],
  ['prompt_copy', '피클 문장 복사'],
  ['share', '공유하기'],
]

const b64url = (s) => Buffer.from(s).toString('base64url')

async function accessToken() {
  const key = JSON.parse(GA_SA_KEY)
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    }),
  )
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  })
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function report(token, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GA 보고서 실패 ${res.status}: ${await res.text()}`)
  return (await res.json()).rows ?? []
}

const RANGES = {
  yesterday: { startDate: 'yesterday', endDate: 'yesterday', name: 'yesterday' },
  dayBefore: { startDate: '2daysAgo', endDate: '2daysAgo', name: 'dayBefore' },
  week: { startDate: '7daysAgo', endDate: 'yesterday', name: 'week' },
  month: { startDate: '28daysAgo', endDate: 'yesterday', name: 'month' },
  all: { startDate: '2026-11-01', endDate: 'yesterday', name: 'all' },
}

/** 기간 이름 → [지표 값...]. 기간이 여러 개일 때만 GA 가 dateRange 차원을 붙여 주므로, 하나면 only 이름을 쓴다. */
const byRange = (rows, only) =>
  Object.fromEntries(rows.map((r) => [r.dimensionValues?.at(-1).value ?? only, r.metricValues.map((m) => Number(m.value))]))

const token = await accessToken()

// GA 는 한 번에 기간을 4개까지만 받는다.
const totalsA = byRange(
  await report(token, {
    dateRanges: [RANGES.yesterday, RANGES.dayBefore, RANGES.week, RANGES.month],
    metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
  }),
)
const totalsB = byRange(await report(token, { dateRanges: [RANGES.all], metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }] }), 'all')
const totals = { ...totalsA, ...totalsB }
const users = (k) => totals[k]?.[0] ?? 0
const newUsers = (k) => totals[k]?.[1] ?? 0

const eventRows = await report(token, {
  dateRanges: [RANGES.yesterday, RANGES.all],
  dimensions: [{ name: 'eventName' }],
  metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
  dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: EVENTS.map(([e]) => e) } } },
})
const events = {}
for (const r of eventRows) {
  const [name, range] = r.dimensionValues.map((d) => d.value)
  ;(events[name] ??= {})[range] = r.metricValues.map((m) => Number(m.value))
}

const countries = await report(token, {
  dateRanges: [RANGES.week],
  dimensions: [{ name: 'country' }],
  metrics: [{ name: 'activeUsers' }],
  orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  limit: 5,
})

const diff = users('yesterday') - users('dayBefore')
const arrow = diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : '–'
const day = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10)

const eventLines = EVENTS.map(([e, label]) => {
  const [yc = 0, yu = 0] = events[e]?.yesterday ?? []
  const [ac = 0, au = 0] = events[e]?.all ?? []
  return `${label} \`${e}\`: 어제 ${yc}회·${yu}명 / 누적 ${ac}회·${au}명`
})

const content = [
  `**🥒 Pickle Desk 일일 사용자 · ${day}**`,
  `어제 활성 사용자 **${users('yesterday')}명** (${arrow}, 새 사용자 ${newUsers('yesterday')}명)`,
  `최근 7일 ${users('week')}명 · 최근 28일 ${users('month')}명 · 누적 ${users('all')}명`,
  '',
  '**동작별**',
  ...eventLines,
  '',
  `**최근 7일 국가**: ${countries.map((r) => `${r.dimensionValues[0].value || '알 수 없음'} ${r.metricValues[0].value}`).join(' · ') || '없음'}`,
  `-# GA 기본 보고서 기준이라 숫자가 몇 시간 늦게 반영될 수 있어요.`,
].join('\n')

if (DRY_RUN) {
  console.log(content)
} else {
  const res = await fetch(DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
  if (!res.ok) throw new Error(`디스코드 전송 실패 ${res.status}`)
  console.log('보냄')
}
