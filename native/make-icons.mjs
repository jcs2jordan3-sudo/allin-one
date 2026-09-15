// 네이티브 앱 아이콘·스플래시 원본 생성 (PWA 아이콘과 같은 디자인, 1024/2732px).
// 산출물은 resources/ 에 두고, @capacitor/assets 가 android/ 각 해상도로 변환한다 (npm run native:icons).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources')
mkdirSync(out, { recursive: true })

const BG = '#0b0f16'
const SPLASH_BG = '#07090e'
const MINT = '#2fd6a0'
const spade = 'M50 8 C38 24 16 38 16 56 C16 68 26 76 36 76 C41 76 45 74 48 71 C46 79 42 86 36 90 L64 90 C58 86 54 79 52 71 C55 74 59 76 64 76 C74 76 84 68 84 56 C84 38 62 24 50 8 Z'

function page({ size, bg, text, spadeScale, spadeY, textY }) {
  const font = `font-family: Pretendard, 'Segoe UI', Roboto, Arial, sans-serif`
  return `<!doctype html><html><body style="margin:0;background:${bg ?? 'transparent'}">
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" style="display:block">
    ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
    <g transform="translate(50 ${spadeY}) scale(${spadeScale}) translate(-50 -50)"><path d="${spade}" fill="${MINT}"/></g>
    ${text ? `<text x="50" y="${textY}" text-anchor="middle" font-size="14" font-weight="900" fill="#f3f6fa" style="${font}">ALL-IN ONE</text>` : ''}
  </svg></body></html>`
}

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const shoot = async (name, html, size, omitBackground) => {
  const p = await ctx.newPage()
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(html)
  await p.screenshot({ path: join(out, name), omitBackground, clip: { x: 0, y: 0, width: size, height: size } })
  await p.close()
  console.log('wrote', name)
}
// 일반 아이콘: 스페이드 + 글자 (PWA 아이콘과 동일)
await shoot('icon-only.png', page({ size: 1024, bg: BG, text: true, spadeScale: 0.62, spadeY: 40, textY: 86 }), 1024, false)
// 적응형(adaptive) 전경: 시스템이 가장자리를 잘라내므로 중앙 66% 안에만 그린다
await shoot('icon-foreground.png', page({ size: 1024, bg: null, text: false, spadeScale: 0.5, spadeY: 50, textY: 0 }), 1024, true)
await shoot('icon-background.png', page({ size: 1024, bg: BG, text: false, spadeScale: 0, spadeY: 50, textY: 0 }), 1024, false)
// 스플래시: 어두운 바탕 가운데 스페이드
const splash = page({ size: 2732, bg: SPLASH_BG, text: true, spadeScale: 0.28, spadeY: 46, textY: 66 })
await shoot('splash.png', splash, 2732, false)
await shoot('splash-dark.png', splash, 2732, false)
await browser.close()
