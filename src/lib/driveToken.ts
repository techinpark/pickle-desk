import { createContext } from 'react'

/** 드라이브 이미지를 읽을 토큰. 로그인하지 않았으면 null. */
export const DriveToken = createContext<(() => string) | null>(null)
