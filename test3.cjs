/** Win highlight: the amber line and rings must reach the canvas. */
const { createRequire } = require('node:module')
const { chromium } = createRequire('/home/liumanu/code/deepseek-harness/apps/web/package.json')('playwright')

;(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.goto('file:///home/liumanu/dsh/gomoku/gomoku.html')
  await page.waitForTimeout(200)
  const out = await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
    for (const [x, y] of [[5, 7], [0, 0], [6, 7], [0, 1], [7, 7], [0, 2], [8, 7], [0, 3], [9, 7]]) g.place(x, y)
    const canvas = document.getElementById('board')
    const dpr = canvas.width / canvas.getBoundingClientRect().width
    const ctx = canvas.getContext('2d')
    const { pad, cell } = g.metrics()
    const probe = (fx, fy) => {
      const d = ctx.getImageData(Math.round(fx * dpr), Math.round(fy * dpr), 1, 1).data
      return [d[0], d[1], d[2]]
    }
    // midpoint between two winning stones, and a ring point above stone (7,7)
    return {
      winner: g.state.winner,
      cells: g.state.winCells?.length ?? 0,
      midLine: probe(pad + 5.5 * cell, pad + 7 * cell),
      ring: probe(pad + 7 * cell, pad + (7 - 0.47) * cell),
      status: document.getElementById('statusText').textContent,
      moves: document.getElementById('moveCount').textContent,
      scoreBlack: document.getElementById('scoreBlack').textContent,
    }
  })
  console.log(JSON.stringify(out, null, 1))
  const amber = out.midLine[0] > 180 && out.midLine[2] < 190
  console.log(JSON.stringify({ winnerOk: out.winner === 1, amberLine: amber, statusOk: out.status.includes('黑方五连'), scoreOk: out.scoreBlack === '1' }))
  await page.screenshot({ path: '/home/liumanu/dsh/gomoku/shots/win.png' })
  await browser.close()
})()
