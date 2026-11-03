import { Fragment, useMemo } from 'react'
import { useI18n } from '../i18n/i18n'
import { dayKey, dayLabel } from '../lib/format'
import type { Task } from '../lib/types'
import { Icon } from './Icon'
import { TaskItem } from './TaskItem'

interface Props {
  tasks: Task[]
  freshIds: Set<number>
  loading: boolean
  filtered: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

export function Timeline({ tasks, freshIds, loading, filtered, hasMore, loadingMore, onLoadMore }: Props) {
  const { t, locale } = useI18n()
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Task[] }[] = []
    for (const task of tasks) {
      const key = dayKey(task.createdAt)
      const last = out[out.length - 1]
      if (last?.key === key) last.items.push(task)
      else {
        const l = dayLabel(task.createdAt, locale)
        out.push({ key, label: l === 'today' ? t('timeline.today') : l === 'yesterday' ? t('timeline.yesterday') : l, items: [task] })
      }
    }
    return out
  }, [tasks, locale, t])

  if (loading) {
    return (
      <div className="timeline" aria-busy="true" aria-label={t('timeline.loading')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-turn">
            <div className="skeleton sk-card" />
            <div className="skeleton sk-bubble" />
          </div>
        ))}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name="tower" size={28} />
        </div>
        <p className="empty-title">{t(filtered ? 'timeline.filteredEmpty' : 'timeline.empty.title')}</p>
        {!filtered && <p className="empty-body">{t('timeline.empty.body')}</p>}
      </div>
    )
  }

  return (
    <div className="timeline">
      {hasMore && (
        <button type="button" className="load-more" onClick={onLoadMore} disabled={loadingMore}>
          {t('timeline.loadMore')}
        </button>
      )}
      {groups.map((g) => (
        <Fragment key={g.key}>
          <div className="day-sep">
            <span>{g.label}</span>
          </div>
          {g.items.map((task) => (
            <TaskItem key={task.id} task={task} fresh={freshIds.has(task.id)} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
