export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'seg-on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
