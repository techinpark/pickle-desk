import type { Locale } from './settings'
import { SHEET_NAME } from './sheet'

export const BACKFILL_OPTIONS = [0, 7, 30] as const
export type BackfillDays = (typeof BACKFILL_OPTIONS)[number]

const LINES: Record<Locale, (url: string) => string[]> = {
  ko: (url) => [
    `이 구글 시트가 내 작업함이야: ${url}`,
    `5분마다 ${SHEET_NAME} 탭을 확인해서 자동으로 처리해 줘.`,
    '1. Status 가 pending 인 행을 위에서부터 확인해.',
    '2. 작업을 시작할 때 Status 를 running 으로 바꿔.',
    '3. 끝나면 Reply 에 한두 문장 요약 답을, Result 에 자세한 결과를 적고 Status 를 done 으로 바꿔.',
    '4. 할 수 없으면 Reply 에 이유를 적고 Status 를 failed 로 바꿔.',
    '5. 나에게 먼저 알려 줄 알림이나 제안이 있으면 새 행을 추가해서 Task 에 제목, Reply 에 내용을 적고 Status 를 done 으로 둬.',
    '6. Id, Task, Category, CreatedAt 칸은 고치지 마. 새 행의 Id 는 비워 두면 돼.',
  ],
  en: (url) => [
    `This Google Sheet is my task inbox: ${url}`,
    `Check the ${SHEET_NAME} tab every 5 minutes and handle it automatically.`,
    '1. Look at rows whose Status is pending, starting from the top.',
    '2. When you start a task, change its Status to running.',
    '3. When you finish, write a one- or two-sentence answer in Reply and the full result in Result, then change Status to done.',
    "4. If you can't do it, write why in Reply and change Status to failed.",
    '5. If you have an alert or suggestion for me, add a new row with a title in Task and the details in Reply, and set Status to done.',
    "6. Don't edit the Id, Task, Category or CreatedAt cells. Leave Id empty on new rows.",
  ],
}

/** 처음 연결할 때 지난 기록을 채워 달라는 한 줄. README 에도 같은 문장이 있다(테스트로 맞춘다). */
export function backfillLine(days: number, locale: Locale = 'ko'): string {
  return locale === 'en'
    ? `7. Only once, at the start: add new rows for the tasks I gave you in the last ${days} days and their results, as far as you remember. Put the task in Task, a one- or two-sentence result in Reply and the full result in Result, set Status to done (failed if it wasn't finished) and Category to task, and write the date and time I asked in CreatedAt as YYYY-MM-DD HH:mm:ss. Add them oldest first and leave Id empty.`
    : `7. 처음 한 번만: 최근 ${days}일 동안 내가 너에게 맡긴 일과 그 결과를 기억나는 만큼 새 행으로 추가해 줘. Task 에 맡긴 일, Reply 에 한두 문장 결과, Result 에 자세한 결과를 적고, Status 는 done(끝내지 못한 일은 failed), Category 는 task, CreatedAt 에는 그 일을 맡긴 날짜와 시각을 YYYY-MM-DD HH:mm:ss 로 적어. 오래된 것부터 차례로 넣고 Id 는 비워 둬.`
}

/** 피클(구글 연동 + 5분 스케줄)에게 보낼 지시문. README(한국어)·README.en.md(영어)에도 같은 문장이 있다(테스트로 맞춘다). */
export function pickleInstruction(sheetUrl: string, backfillDays: BackfillDays = 0, locale: Locale = 'ko'): string {
  const lines = LINES[locale](sheetUrl)
  if (backfillDays > 0) lines.push(backfillLine(backfillDays, locale))
  return lines.join('\n')
}
