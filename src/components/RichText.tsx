import { splitLinks } from '../lib/format'

export function RichText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}
