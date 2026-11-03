// 처음 설정 단계. 새로고침해도 이어서 하도록 시트 ID 와 함께 기억한다.
// 이미 만든 작업함을 다른 기기에서 찾은 경우에는 온보딩을 하지 않는다(피클이 이미 연결돼 있을 테니).

export const STEPS = ['create', 'google', 'prompt', 'test', 'finish'] as const
export type Step = (typeof STEPS)[number]

const KEY = 'pickledesk.onboarding.v1'

export interface Onboarding {
  sheetId: string
  step: Step
  /** 연결 확인용으로 보낸 테스트 작업 Id */
  testId?: number
}

export function loadOnboarding(storage: Storage = localStorage): Onboarding | null {
  try {
    const o = JSON.parse(storage.getItem(KEY) ?? 'null') as Onboarding | null
    return o && typeof o.sheetId === 'string' && (STEPS as readonly string[]).includes(o.step) ? o : null
  } catch {
    return null
  }
}

export function saveOnboarding(o: Onboarding | null, storage: Storage = localStorage) {
  if (o) storage.setItem(KEY, JSON.stringify(o))
  else storage.removeItem(KEY)
}
