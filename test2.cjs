/** Canvas-level checks: real clicks land on the right point, stones really paint. */
const { createRequire } = require('node:module')
const { chromium } = createRequire('/home/liumanu/code/deepseek-harness/apps/web/package.json')('playwright')

;(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('file:///home/liumanu/dsh/gomoku/gomoku.html')
  await page.waitForTimeout(200)

  await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
  })

  // Click the intersection (7,7) and (8,8) with the real pointer.
  const points = await page.evaluate(() => {
    const { pad, cell } = window.__gomoku.metrics()
    const rect = document.getElementById('board').getBoundingClientRect()
    const at = (x, y) => ({ x: rect.left + pad + x * cell, y: rect.top + pad + y * cell })
    return { first: at(7, 7), second: at(8, 8) }
  })
  await page.mouse.click(points.first.x, points.first.y)
  await page.mouse.click(points.second.x, points.second.y)
  await page.waitForTimeout(120)
  const placed = await page.evaluate(() => window.__gomoku.state.history.map(m => [m.x, m.y, m.player]))
  console.log('clicks ->', JSON.stringify(placed))

  // Pixel probes: stone centres dark/light, empty intersections wood-coloured.
  const pixels = await page.evaluate(() => {
    const g = window.__gomoku
    const { pad, cell } = g.metrics()
    const canvas = document.getElementById('board')
    const dpr = canvas.width / canvas.getBoundingClientRect().width
    const ctx = canvas.getContext('2d')
    const probe = (x, y) => {
      const px = Math.round((pad + x * cell) * dpr)
      const py = Math.round((pad + y * cell) * dpr)
      const d = ctx.getImageData(px, py, 1, 1).data
      const luma = 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]
      return { rgb: [d[0], d[1], d[2]], luma: Math.round(luma) }
    }
    return {
      blackStone: probe(7, 7),
      whiteStone: probe(8.3, 8),
      empty: probe(4, 4),
      gridFree: probe(11, 3),
    }
  })
  console.log('pixels ->', JSON.stringify(pixels))

  const okBlack = pixels.blackStone.luma < 90
  const okWhite = pixels.whiteStone.luma > 170
  const okEmpty = pixels.empty.luma > 150
  const okClicks = placed.length === 2 && placed[0][0] === 7 && placed[0][1] === 7 && placed[1][0] === 8 && placed[1][1] === 8
  const okErrors = errors.length === 0
  console.log(JSON.stringify({ okClicks, okBlack, okWhite, okEmpty, okErrors, errors }, null, 1))

  // Keyboard reset
  await page.keyboard.press('r')
  await page.waitForTimeout(100)
  const afterReset = await page.evaluate(() => window.__gomoku.state.history.length)
  console.log('after R ->', afterReset)
  await browser.close()
})()
