import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { captureInstallPrompt } from './lib/install'

registerSW({ immediate: true })
captureInstallPrompt()

// 앱처럼 쓰도록 확대·축소를 막는다. iOS Safari 는 viewport 의 user-scalable=no 를 무시해서 핀치 제스처를 직접 막는다.
// (두 번 탭 확대는 CSS touch-action: manipulation 으로 막는다)
const noZoom = (e: Event) => e.preventDefault()
document.addEventListener('gesturestart', noZoom)
document.addEventListener('gesturechange', noZoom)
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
