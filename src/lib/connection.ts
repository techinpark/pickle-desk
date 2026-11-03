import type { StringKey } from '../i18n/strings'
import { isScriptUrl, SheetError, type Connection } from './sheet'

export const CONN_KEY = 'picklejar.connection.v1'
export const GUIDE_URL = 'https://github.com/techinpark/pickle-jar#readme'

export function loadConnection(storage: Storage = localStorage): Connection | null {
  try {
    const raw = JSON.parse(storage.getItem(CONN_KEY) ?? 'null') as Partial<Connection> | null
    if (raw && typeof raw.url === 'string' && typeof raw.key === 'string' && isScriptUrl(raw.url) && raw.key) {
      return { url: raw.url, key: raw.key }
    }
  } catch {
    // 깨진 값은 없는 것으로 본다
  }
  return null
}

export function saveConnection(c: Connection | null, storage: Storage = localStorage) {
  if (c) storage.setItem(CONN_KEY, JSON.stringify(c))
  else storage.removeItem(CONN_KEY)
}

/**
 * 시트 메뉴의 "휴대폰 연결하기"가 만든 링크(`#connect?u=…&k=…`)에서 연결 정보를 읽는다.
 * 키가 # 뒤에 있어서 앱을 호스팅하는 서버에는 전달되지 않는다.
 */
export function parseConnectLink(hash: string): Connection | null {
  const m = /^#connect\?(.*)$/.exec(hash)
  if (!m) return null
  const p = new URLSearchParams(m[1])
  const url = p.get('u')?.trim() ?? ''
  const key = p.get('k')?.trim() ?? ''
  return isScriptUrl(url) && key ? { url, key } : null
}

/** 연결 실패를 사용자가 고칠 수 있는 안내 문구로 바꾼다. */
export function errorKey(e: unknown): StringKey {
  if (e instanceof SheetError) {
    if (e.kind === 'unauthorized') return 'connect.err.key'
    if (e.kind === 'access') return 'connect.err.access'
    if (e.kind === 'server' && e.message === 'no_sheet') return 'connect.err.noSheet'
    if (e.kind === 'timeout') return 'connect.err.timeout'
  }
  return 'connect.err.network'
}
