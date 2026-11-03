// 앱이 백그라운드에 있는 동안 새 답변이 오면 시스템 알림을 띄운다(로컬 알림).
// 서버 푸시가 아니라 앱이 살아 있는 동안에만 온다. 앱을 완전히 닫으면 오지 않는다.
// 아이폰은 홈 화면에 추가한 앱(iOS 16.4+)에서만 알림을 쓸 수 있고, 백그라운드에서 곧 멈춘다.
import type { Task } from './types'

export type NotifySupport = 'ok' | 'needsInstall' | 'unsupported'

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function notifySupport(): NotifySupport {
  if (typeof Notification !== 'undefined' && 'serviceWorker' in navigator) return 'ok'
  return isIOS() && !isStandalone() ? 'needsInstall' : 'unsupported'
}

export const notifyGranted = () => notifySupport() === 'ok' && Notification.permission === 'granted'

/** 알림 권한을 묻는다. 버튼을 누른 그 순간에 불러야 한다(브라우저가 사용자 동작 없이 묻는 걸 막는다). */
export async function requestNotify(): Promise<boolean> {
  if (notifySupport() !== 'ok') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** 알릴 만한 변화인지: 답변이 새로 붙었거나 완료·실패로 바뀐 경우. prev 가 없으면 피클이 새로 추가한 행이다. */
export function worthNotifying(prev: Task | undefined, next: Task): boolean {
  if (!prev) return next.reply.trim() !== '' || next.status === 'done' || next.status === 'failed'
  const newReply = next.reply.trim() !== '' && next.reply !== prev.reply
  const finished = next.status !== prev.status && (next.status === 'done' || next.status === 'failed')
  return newReply || finished
}

/** 한 번에 이보다 많이 바뀌면(지난 기록 채우기 등) 알림을 하나로 묶는다. */
export const NOTIFY_BATCH = 3

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function showTaskNotification(task: Task, title: string, fallbackBody: string) {
  const body = clip(task.reply.trim() || fallbackBody, 140)
  return show(title, `${clip(task.task, 40)}\n${body}`, `task-${task.id}`)
}

export const showSummaryNotification = (title: string, body: string) => show(title, body, 'summary')

async function show(title: string, body: string, tag: string) {
  if (!notifyGranted()) return
  const options: NotificationOptions = {
    body,
    tag,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    data: { url: window.location.origin + import.meta.env.BASE_URL },
  }
  try {
    // 안드로이드 크롬과 iOS 는 new Notification 을 막고 서비스 워커로만 띄울 수 있다.
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    // 알림을 못 띄워도 앱 동작에는 영향이 없다.
  }
}
