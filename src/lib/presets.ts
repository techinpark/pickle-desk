import type { IconName } from '../components/Icon'
import type { StringKey } from '../i18n/strings'
import type { Category } from './types'

// 자주 쓰는 지시. 누르면 바로 pending 작업으로 등록된다.
export const PRESETS: { id: string; label: StringKey; task: StringKey; category: Category; icon: IconName }[] = [
  { id: 'mail', label: 'preset.mail', task: 'preset.mail.task', category: 'quick_action', icon: 'mail' },
  { id: 'reviews', label: 'preset.reviews', task: 'preset.reviews.task', category: 'quick_action', icon: 'star' },
  { id: 'briefing', label: 'preset.briefing', task: 'preset.briefing.task', category: 'briefing', icon: 'sun' },
]
