import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const mark = (size, maskable) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="#1f3a5f"/>
  <g transform="${maskable ? 'translate(46 46) scale(0.82)' : ''}">
    <rect x="96" y="148" width="320" height="22" rx="11" fill="#f4f1ea"/>
    <rect x="96" y="206" width="250" height="22" rx="11" fill="#f4f1ea"/>
    <rect x="96" y="264" width="300" height="22" rx="11" fill="#f4f1ea"/>
    <path d="M96 318c48 36 92-36 140 0s96 36 180-28" fill="none" stroke="#e4c58a" stroke-width="16" stroke-linecap="round"/>
    <path d="M338 372l36 36 78-92" fill="none" stroke="#e4c58a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
})
await mkdir('public/icons', { recursive: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const [name, size, maskable] of [
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-maskable.png', 512, true],
]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:#1f3a5f}</style>${mark(size, maskable)}`)
  await page.screenshot({ path: name, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('icônes écrites')
