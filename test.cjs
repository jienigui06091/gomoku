/** Headless checks for the gomoku page: rules, AI, undo, layout. */
const { createRequire } = require('node:module')
const { chromium } = createRequire('/home/liumanu/code/deepseek-harness/apps/web/package.json')('playwright')

const URL = 'file:///home/liumanu/dsh/gomoku/gomoku.html'
const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); }

;(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(URL)
  await page.waitForTimeout(200)

  // 1. horizontal win
  const win = await page.evaluate(() => {
    const g = window.__gomoku
    g.state.mode = 'pvp'
    g.reset()
    for (let i = 0; i < 5; i += 1) {
      g.place(3 + i, 5)
      if (i < 4) g.place(3 + i, 6)
    }
    return { winner: g.state.winner, cells: g.state.winCells?.length ?? 0, turn: g.state.turn }
  })
  check('横向五连判胜', win.winner === 1 && win.cells >= 5, JSON.stringify(win))

  // 2. diagonal win for white
  const diag = await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    const seq = [[0, 0], [4, 4], [1, 0], [5, 5], [2, 0], [6, 6], [3, 0], [7, 7], [9, 9], [8, 8]]
    for (const [x, y] of seq) g.place(x, y)
    return { winner: g.state.winner, cells: g.state.winCells?.length ?? 0 }
  })
  check('斜向五连判胜', diag.winner === 2 && diag.cells >= 5, JSON.stringify(diag))

  // 3. no move after the game is over
  const frozen = await page.evaluate(() => {
    const g = window.__gomoku
    const before = g.state.history.length
    g.place(10, 0)
    return { before, after: g.state.history.length }
  })
  check('终局后禁止落子', frozen.before === frozen.after, JSON.stringify(frozen))

  // 4. AI answers a human move
  const ai = await page.evaluate(async () => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pve'
    g.state.difficulty = 'normal'
    g.place(7, 7)
    await new Promise(r => setTimeout(r, 400))
    return { moves: g.state.history.length, turn: g.state.turn, first: g.state.history[0], reply: g.state.history[1] }
  })
  check('AI 应手', ai.moves === 2 && ai.turn === 1 && ai.reply?.player === 2, JSON.stringify(ai))

  // 5. undo removes the pair in pve
  const undone = await page.evaluate(() => {
    const g = window.__gomoku
    g.undo()
    return { moves: g.state.history.length, turn: g.state.turn }
  })
  check('悔棋回退一整手', undone.moves === 0 && undone.turn === 1, JSON.stringify(undone))

  // 6. AI blocks an open four
  const block = await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
    for (const [x, y] of [[7, 7], [7, 8], [8, 7], [8, 8], [9, 7], [10, 10], [10, 7]]) g.place(x, y)
    const move = g.chooseMove(g.state.board, 2, 'hard')
    return { move }
  })
  check('AI 堵四', (block.move[0] === 6 && block.move[1] === 7) || (block.move[0] === 11 && block.move[1] === 7), JSON.stringify(block))

  // 7. AI takes its own win
  const finish = await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
    for (const [x, y] of [[5, 5], [0, 0], [6, 5], [0, 1], [7, 5], [0, 2], [8, 5], [0, 3]]) g.place(x, y)
    const move = g.chooseMove(g.state.board, 2, 'normal')
    return { move, turn: g.state.turn }
  })
  check('AI 抓自己的五连', finish.move[0] === 0 && finish.move[1] === 4, JSON.stringify(finish))

  // 8. hard AI never hands over an immediate loss
  const safe = await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
    for (const [x, y] of [[6, 6], [6, 7], [7, 6], [7, 7], [8, 8], [5, 5], [3, 10]]) g.place(x, y)
    const move = g.chooseMove(g.state.board, 2, 'hard')
    return { move }
  })
  check('AI 会应对双三/活三', Array.isArray(safe.move) && safe.move.length === 2, JSON.stringify(safe))

  // 9. layout: square canvas, no overflow
  const layout = await page.evaluate(() => {
    const canvas = document.getElementById('board')
    const rect = canvas.getBoundingClientRect()
    return {
      w: Math.round(rect.width), h: Math.round(rect.height),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflowY: document.documentElement.scrollHeight > window.innerHeight + 1,
      cssW: canvas.style.width,
    }
  })
  check('棋盘为正方形且不溢出', layout.w === layout.h && layout.w > 300 && !layout.overflowX && !layout.overflowY, JSON.stringify(layout))

  // 10. mobile layout
  await page.setViewportSize({ width: 420, height: 860 })
  await page.waitForTimeout(250)
  const mobile = await page.evaluate(() => {
    const rect = document.getElementById('board').getBoundingClientRect()
    return { w: Math.round(rect.width), h: Math.round(rect.height), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })
  check('窄屏自适应', mobile.w === mobile.h && !mobile.overflowX, JSON.stringify(mobile))

  // screenshots: mid-game and a finished game
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pvp'
    // a plausible opening
    for (const [x, y] of [[7, 7], [8, 8], [8, 7], [7, 8], [6, 8], [9, 7], [6, 7], [9, 8], [5, 9], [10, 6]]) g.place(x, y)
  })
  await page.screenshot({ path: '/home/liumanu/dsh/gomoku/shots/midgame.png' })

  await page.evaluate(() => {
    const g = window.__gomoku
    g.reset()
    g.state.mode = 'pve'
    g.state.difficulty = 'hard'
    g.place(7, 7)
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const g = window.__gomoku
    g.state.mode = 'pvp'
    for (const [x, y] of [[8, 7], [6, 7], [9, 7], [5, 7], [10, 7]]) g.place(x, y)
  })
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/home/liumanu/dsh/gomoku/shots/win.png' })

  check('无控制台报错', errors.length === 0, errors.join(' | ').slice(0, 300))
  console.log(JSON.stringify(results, null, 1))
  const failed = results.filter(r => !r.ok).length
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
  await browser.close()
})()
