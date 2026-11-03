import { SHEET_NAME } from './sheet'

/** 피클(구글 연동 + 5분 스케줄)에게 보낼 지시문. README 5단계에도 같은 문장이 있다(테스트로 맞춘다). */
export function pickleInstruction(sheetUrl: string): string {
  return [
    `이 구글 시트가 내 작업함이야: ${sheetUrl}`,
    `5분마다 ${SHEET_NAME} 탭을 확인해서 자동으로 처리해 줘.`,
    '1. Status 가 pending 인 행을 위에서부터 확인해.',
    '2. 작업을 시작할 때 Status 를 running 으로 바꿔.',
    '3. 끝나면 Reply 에 한두 문장 요약 답을, Result 에 자세한 결과를 적고 Status 를 done 으로 바꿔.',
    '4. 할 수 없으면 Reply 에 이유를 적고 Status 를 failed 로 바꿔.',
    '5. 나에게 먼저 알려 줄 알림이나 제안이 있으면 새 행을 추가해서 Task 에 제목, Reply 에 내용을 적고 Status 를 done 으로 둬.',
    '6. Id, Task, Category, CreatedAt 칸은 고치지 마. 새 행의 Id 는 비워 두면 돼.',
  ].join('\n')
}
