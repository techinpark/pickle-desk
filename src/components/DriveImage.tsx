import { useContext, useEffect, useState } from 'react'
import { driveFileUrl, loadImage } from '../lib/attach'
import { DriveToken } from '../lib/driveToken'

/** 작업에 붙인 드라이브 이미지 미리보기. 못 읽으면(앱이 올리지 않은 파일 등) 링크만 보여 준다. */
export function DriveImage({ id, alt }: { id: string; alt: string }) {
  const token = useContext(DriveToken)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!token) return
    let url: string | null = null
    let alive = true
    loadImage(token, id)
      .then((u) => {
        url = u
        if (alive) setSrc(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, token])

  return (
    <a className="task-image" href={driveFileUrl(id)} target="_blank" rel="noopener noreferrer" data-testid="task-image">
      {src ? <img src={src} alt={alt} /> : <span className={failed ? 'task-image-link' : 'skeleton task-image-loading'}>{failed ? alt : ''}</span>}
    </a>
  )
}
