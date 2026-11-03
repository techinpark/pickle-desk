import { useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { timeLabel } from '../lib/format'
import type { Task } from '../lib/types'
import { Icon } from './Icon'
import { RichText } from './RichText'
import { StatusBadge } from './StatusBadge'

export function TaskItem({ task, fresh }: { task: Task; fresh: boolean }) {
  const { t, locale } = useI18n()
  const [copied, setCopied] = useState(false)
  const hasReply = task.reply.trim().length > 0
  const hasResult = task.result.trim().length > 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(task.result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 권한이 없으면 조용히 넘어간다
    }
  }

  return (
    <article className={`turn${fresh ? ' turn-fresh' : ''}`} data-testid="task-item" data-id={task.id}>
      <div className="me-row">
        <div className="task-card">
          <div className="task-card-top">
            <span className={`chip chip-${task.category}`}>{t(`category.${task.category}`)}</span>
            <StatusBadge status={task.status} />
          </div>
          <p className="task-text">
            <RichText text={task.task} />
          </p>
          <time className="meta" dateTime={task.createdAt}>
            {timeLabel(task.createdAt, locale)}
          </time>
        </div>
      </div>

      <div className="agent-row">
        <div className="agent-col">
          <span className="sr-only">{t('timeline.agent')}</span>
          {hasReply ? (
            <div className={`bubble${task.status === 'failed' ? ' bubble-failed' : ''}`}>
              <RichText text={task.reply} />
            </div>
          ) : task.status === 'pending' || task.status === 'running' ? (
            <div className="bubble bubble-waiting" aria-live="polite">
              <span className="typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {t(task.status === 'running' ? 'timeline.working' : 'timeline.waiting')}
            </div>
          ) : null}
          {hasResult && (
            <div className="result">
              <div className="result-head">
                <span>{t('timeline.result')}</span>
                <button type="button" className="ghost-btn" onClick={copy} aria-label={t('timeline.copy')}>
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? t('timeline.copied') : t('timeline.copy')}
                </button>
              </div>
              <p className="result-text">
                <RichText text={task.result} />
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
