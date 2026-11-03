import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// 워커 테스트는 node 환경이라 window 가 없다.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })
  // jsdom 에 없는 API
  window.scrollTo = (() => {}) as typeof window.scrollTo
}
