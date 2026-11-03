// 앱 아이콘(흰 배경 + 파란 관제탑) SVG 를 브라우저로 렌더링해 public/ 에 PNG 로 저장한다.
// 사용: node tool/make_icons.mjs  (playwright 의 chromium 필요)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const glyph = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect width="64" height="64" fill="#fff"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <g fill="none" stroke="#3182F6" stroke-width="4.5" stroke-linecap="round">
      <path d="M32 30v22M23 52h18M26.5 41.5h11"/>
      <path d="M22.5 20.5a13.4 13.4 0 0 1 19 0M16 14a22.6 22.6 0 0 1 32 0"/>
    </g>
    <circle cx="32" cy="27" r="4.2" fill="#3182F6"/>
  </g>
</svg>`

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78], // 안전 영역(가운데 80%) 안에 들어가게
  ['apple-touch-icon.png', 180, 0.9],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0">${glyph(scale)}</body></html>`)
  await page.screenshot({ path: path.join(OUT, name), omitBackground: false })
}
await browser.close()
console.log('ok')
