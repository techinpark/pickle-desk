import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { timeLabel } from '../lib/format'
import { STATUSES, type ConnectionState, type Status } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  state: ConnectionState
  lastSyncedAt: Date | null
  counts: Record<Status, number>
  filter: Status | 'all'
  onFilter: (f: Status | 'all') => void
  onSettings: () => void
  showFilters: boolean
}

export function Header({ state, lastSyncedAt, counts, filter, onFilter, onSettings, showFilters }: Props) {
  const { t, locale } = useI18n()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const active = counts.pending + counts.running

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="tower" size={20} />
          </div>
          <div className="brand-text">
            <h1>{t('appName')}</h1>
            <p className="sub">
              <span className={`conn conn-${state}`} data-testid="conn-state" data-state={state}>
                <span className="conn-dot" aria-hidden="true" />
                {t(`conn.${state}`)}
              </span>
              {state === 'online' && lastSyncedAt && (
                <span className="synced">· {t('conn.synced', { time: timeLabel(lastSyncedAt.toISOString(), locale) })}</span>
              )}
              {active > 0 && <span className="synced">· {t('summary.active', { n: active })}</span>}
            </p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onSettings} aria-label={t('settings.title')} data-testid="open-settings">
          <Icon name="settings" />
        </button>
      </div>
      {showFilters && (
        <nav className="filters" aria-label={t('a11y.filter')}>
          {(['all', ...STATUSES] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter${filter === f ? ' filter-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => onFilter(f)}
            >
              {f === 'all' ? t('filter.all') : t(`status.${f}`)}
              {f !== 'all' && counts[f] > 0 && <span className="filter-count">{counts[f]}</span>}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}
