// 작업에 붙이는 이미지. 내 드라이브의 "Pickle Desk 첨부" 폴더에 올리고, 작업 글에 드라이브 링크를 적는다.
// drive.file 권한이라 앱이 올린 파일만 다룬다. 공유 설정은 바꾸지 않는다: 피클은 같은 계정의 구글 연동으로 연다.
import { SheetError } from './sheet'

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_PROP = { key: 'pickleDesk', value: 'attachments' }
export const MAX_IMAGES = 4
/** 이보다 긴 변은 줄여서 올린다(휴대폰 사진은 10MB 가 넘기도 한다). */
const MAX_SIDE = 2000
const UPLOAD_TIMEOUT_MS = 60_000

const auth = (token: () => string) => ({ authorization: `Bearer ${token()}` })

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal })
  } catch {
    throw new SheetError(ctrl.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new SheetError(res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'server', res.statusText)
  return (await res.json()) as T
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`

const DRIVE_FILE_RE = /https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/view\S*/g

/** 작업 글에서 드라이브 파일 ID 를 뽑는다(앱이 붙인 이미지 링크). */
export function driveFileIds(text: string): string[] {
  return [...text.matchAll(DRIVE_FILE_RE)].map((m) => m[1])
}

/** 작업 글에서 이미지 링크만 있는 줄을 뺀다. 이미지는 따로 보여 준다. */
export function withoutImageLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(?:[^:：]{1,20}[:：]\s*)?https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view\S*\s*$/.test(line))
    .join('\n')
    .trim()
}

/** 작업 글 끝에 이미지 링크를 붙인다. */
export function withImageLinks(text: string, ids: string[], label: string): string {
  if (ids.length === 0) return text
  return [text, '', ...ids.map((id) => `${label}: ${driveFileUrl(id)}`)].join('\n').trim()
}

let folderId: Promise<string> | null = null

/** 첨부 폴더를 찾거나 만든다. 한 번 찾으면 기억한다. */
function attachFolder(token: () => string, name: string): Promise<string> {
  folderId ??= (async () => {
    const q = `appProperties has { key='${FOLDER_PROP.key}' and value='${FOLDER_PROP.value}' } and trashed = false`
    const found = await call<{ files?: { id: string }[] }>(`${DRIVE}?q=${encodeURIComponent(q)}&pageSize=1&fields=files(id)`, {
      headers: auth(token),
    })
    if (found.files?.[0]) return found.files[0].id
    const made = await call<{ id: string }>(`${DRIVE}?fields=id`, {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', appProperties: { [FOLDER_PROP.key]: FOLDER_PROP.value } }),
    })
    return made.id
  })().catch((e) => {
    folderId = null
    throw e
  })
  return folderId
}

/** 큰 사진은 긴 변 MAX_SIDE 의 JPEG 로 줄인다. 줄일 수 없으면(지원 안 되는 형식 등) 원본을 그대로 쓴다. */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml' || typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 3_000_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

/** 이미지를 첨부 폴더에 올리고 파일 ID 를 돌려준다. */
export async function uploadImage(token: () => string, file: File, folderName: string): Promise<string> {
  const parent = await attachFolder(token, folderName)
  const data = await shrinkImage(file)
  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  const name = data === file ? file.name || 'image' : `${base}.jpg`
  const boundary = `pickle-${crypto.randomUUID()}`
  const meta = { name, parents: [parent] }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${data.type || 'application/octet-stream'}\r\n\r\n`,
    data,
    `\r\n--${boundary}--`,
  ])
  const made = await call<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { ...auth(token), 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return made.id
}

/** 앱이 올린 이미지를 화면에 보여 줄 주소(blob:)로 가져온다. 앱이 올리지 않은 파일은 drive.file 로 못 읽어서 실패한다. */
export async function loadImage(token: () => string, id: string): Promise<string> {
  const res = await fetch(`${DRIVE}/${id}?alt=media`, { headers: auth(token) })
  if (!res.ok) throw new SheetError(res.status === 401 ? 'unauthorized' : 'notFound')
  return URL.createObjectURL(await res.blob())
}

/** 테스트에서 폴더 기억을 지운다. */
export const resetAttachFolder = () => {
  folderId = null
}
