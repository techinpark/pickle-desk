import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n/i18n'
import type { TaskSource } from '../lib/types'
import { PRESETS } from '../lib/presets'
import { CATEGORIES, type Category } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  disabled: boolean
  onSubmit: (task: string, category: Category, source: TaskSource) => Promise<boolean>
}

export function Composer({ disabled, onSubmit }: Props) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [category, setCategory] = useState<Category>('task')
  const [sending, setSending] = useState(false)
  const [picking, setPicking] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // 입력 길이에 맞춰 높이를 늘린다(최대 6줄 정도).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const send = async (value: string, cat: Category, source: TaskSource) => {
    const v = value.trim()
    if (!v || sending || disabled) return
    setSending(true)
    const ok = await onSubmit(v, cat, source)
    setSending(false)
    if (ok && source === 'composer') setText('')
    ref.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 글자 확정이라 보내지 않는다.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void send(text, category, 'composer')
  }

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="presets" role="group" aria-label={t('a11y.presets')}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset"
              disabled={disabled || sending}
              onClick={() => void send(t(p.task), p.category, 'preset')}
              data-testid={`preset-${p.id}`}
            >
              <Icon name={p.icon} size={16} />
              {t(p.label)}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            void send(text, category, 'composer')
          }}
        >
          {picking && (
            <div className="cat-row" role="radiogroup" aria-label={t('a11y.category')}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  className={`cat${category === c ? ' cat-on' : ''}`}
                  onClick={() => {
                    setCategory(c)
                    setPicking(false)
                    ref.current?.focus()
                  }}
                >
                  {t(`category.${c}`)}
                </button>
              ))}
            </div>
          )}
          <div className="input-row">
            <button
              type="button"
              className={`plus${picking ? ' plus-on' : ''}`}
              aria-label={t('a11y.category')}
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
              data-testid="pick-category"
            >
              <Icon name="plus" size={20} />
            </button>
            {category !== 'task' && <span className="cat-picked">{t(`category.${category}`)}</span>}
            <textarea
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('composer.placeholder')}
              aria-label={t('composer.placeholder')}
              disabled={disabled}
              maxLength={4000}
            />
            <button
              type="submit"
              className="send"
              disabled={disabled || sending || !text.trim()}
              aria-label={sending ? t('composer.sending') : t('composer.send')}
            >
              <Icon name="send" size={20} />
            </button>
          </div>
        </form>
        <p className="hint">{t('composer.hint')}</p>
      </div>
    </div>
  )
}
