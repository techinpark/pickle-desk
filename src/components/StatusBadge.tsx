import { useI18n } from '../i18n/i18n'
import type { Status } from '../lib/types'

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n()
  return (
    <span className={`badge badge-${status}`} data-testid="status-badge" data-status={status}>
      {status === 'running' && <span className="pulse-dot" aria-hidden="true" />}
      {t(`status.${status}`)}
    </span>
  )
}
