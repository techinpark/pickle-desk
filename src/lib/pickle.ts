import { SHEET_NAME } from './sheet'

export const BACKFILL_OPTIONS = [0, 7, 30] as const
export type BackfillDays = (typeof BACKFILL_OPTIONS)[number]

/** 처음 연결할 때 지난 기록을 채워 달라는 한 줄. README 에도 같은 문장이 있다({N} 자리만 다름). */
export const backfillLine = (days: number) =>
  `7. 처음 한 번만: 최근 ${days}일 동안 내가 너에게 맡긴 일과 그 결과를 기억나는 만큼 새 행으로 추가해 줘. Task 에 맡긴 일, Reply 에 한두 문장 결과, Result 에 자세한 결과를 적고, Status 는 done(끝내지 못한 일은 failed), Category 는 task, CreatedAt 에는 그 일을 맡긴 날짜와 시각을 YYYY-MM-DD HH:mm:ss 로 적어. 오래된 것부터 차례로 넣고 Id 는 비워 둬.`

/** 피클(구글 연동 + 5분 스케줄)에게 보낼 지시문. README 5단계에도 같은 문장이 있다(테스트로 맞춘다). */
export function pickleInstruction(sheetUrl: string, backfillDays: BackfillDays = 0): string {
  const lines = [
    `이 구글 시트가 내 작업함이야: ${sheetUrl}`,
    `5분마다 ${SHEET_NAME} 탭을 확인해서 자동으로 처리해 줘.`,
    '1. Status 가 pending 인 행을 위에서부터 확인해.',
    '2. 작업을 시작할 때 Status 를 running 으로 바꿔.',
    '3. 끝나면 Reply 에 한두 문장 요약 답을, Result 에 자세한 결과를 적고 Status 를 done 으로 바꿔.',
    '4. 할 수 없으면 Reply 에 이유를 적고 Status 를 failed 로 바꿔.',
    '5. 나에게 먼저 알려 줄 알림이나 제안이 있으면 새 행을 추가해서 Task 에 제목, Reply 에 내용을 적고 Status 를 done 으로 둬.',
    '6. Id, Task, Category, CreatedAt 칸은 고치지 마. 새 행의 Id 는 비워 두면 돼.',
  ]
  if (backfillDays > 0) lines.push(backfillLine(backfillDays))
  return lines.join('\n')
}
