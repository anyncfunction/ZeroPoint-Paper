const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

function typeFromPrompt(prompt) {
  if (prompt.includes('题型：single_choice') || prompt.includes('题型：单选题')) return 'single_choice'
  if (prompt.includes('题型：fill_blank') || prompt.includes('题型：填空题')) return 'fill_blank'
  if (prompt.includes('题型：calculation') || prompt.includes('题型：计算题')) return 'calculation'
  if (prompt.includes('题型：solution') || prompt.includes('题型：解答题')) return 'solution'
  return 'solution'
}

function itemAt(index, type, chapterId, difficulty) {
  const group = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][index] ?? '子'
  const typeWord = {
    single_choice: '选择',
    fill_blank: '填空',
    calculation: '计算',
    solution: '解答'
  }[type]
  return {
    slot: index + 1,
    chapterId,
    knowledgePoint: `知识点${group}`,
    difficulty,
    stem: `${typeWord}${group}题：已知 $x=${index + 2}$，求 $x+1$ 的值。`,
    options:
      type === 'single_choice'
        ? [
            { key: 'A', text: '$1$' },
            { key: 'B', text: '$2$' },
            { key: 'C', text: `${index + 3}` },
            { key: 'D', text: '$4$' }
          ]
        : [],
    answer: type === 'single_choice' ? 'C' : `$${index + 3}$`,
    explanation: `根据题意计算，$x+1=${index + 3}$。`
  }
}

function mockItems(prompt) {
  if (prompt.includes('重新命制一道')) {
    const type = prompt.includes('单选题')
      ? 'single_choice'
      : prompt.includes('填空题')
        ? 'fill_blank'
        : prompt.includes('计算题')
          ? 'calculation'
          : 'solution'
    return [itemAt(9, type, 'renjiao-7-a-1', 6)]
  }
  if (prompt.includes('第二轮强制拔高')) {
    const type = typeFromPrompt(prompt)
    const slotNumbers = [...prompt.matchAll(/"slot"\s*:\s*(\d+)/g)].map((match) =>
      Number(match[1])
    )
    const count = Math.max(0, ...slotNumbers)
    const chapters = [...prompt.matchAll(/"chapterId"\s*:\s*"([^"]+)"/g)].map(
      (match) => match[1]
    )
    return Array.from({ length: count }, (_, index) =>
      itemAt(
        index,
        type,
        chapters[index] ?? chapters[0] ?? 'renjiao-7-a-1',
        10
      )
    )
  }
  const count = Number(prompt.match(/题目数量：(\d+)/)?.[1] ?? 0)
  const type = typeFromPrompt(prompt)
  const slots = [...prompt.matchAll(/章节ID ([a-zA-Z0-9-]+)，难度 (\d+)\/10/g)]
  const embeddedChapters = [
    ...prompt.matchAll(/"chapterId"\s*:\s*"([^"]+)"/g)
  ].map((match) => match[1])
  return Array.from({ length: count }, (_, index) =>
    itemAt(
      index,
      type,
      slots[index]?.[1] ??
        embeddedChapters[index] ??
        embeddedChapters[0] ??
        'renjiao-7-a-1',
      Number(slots[index]?.[2] ?? 6)
    )
  )
}

async function startMockServer() {
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const parsed = JSON.parse(body)
      const prompt = parsed.messages[1].content
      const items = mockItems(prompt)
      const payload = prompt.includes('重新命制一道')
        ? items[0]
        : prompt.includes('第二轮强制拔高')
          ? { upgrades: items }
          : prompt.includes('独立数学解题与审校员')
            ? { corrections: items.slice(0, 1) }
            : { items }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }]
        })
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`
  }
}

async function main() {
  const artifacts = path.join(__dirname, 'artifacts')
  const testData = path.join(__dirname, '.tmp-full-flow-data')
  const testOutput = path.join(__dirname, '.tmp-full-flow-output')
  await fs.mkdir(artifacts, { recursive: true })
  await fs.rm(testData, { recursive: true, force: true })
  await fs.rm(testOutput, { recursive: true, force: true })
  const { server, baseUrl } = await startMockServer()
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      LINGDIAN_E2E_MULTI: '1',
      LINGDIAN_DATA_DIR: testData,
      LINGDIAN_DOCUMENTS_DIR: testOutput
    }
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(
      async (url) => {
        await window.chujuan.saveSettings({
          profile: {
            id: 'default',
            name: '本地模拟',
            baseUrl: url,
            model: 'mock-model',
            authMode: 'user-key',
            timeoutMs: 30000,
            concurrency: 3
          }
        })
      },
      baseUrl
    )
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /七年级/ }).click()
    await page.getByRole('button', { name: /下一步/ }).click()
    const chapters = page.locator('.chapter-row')
    await chapters.nth(0).click()
    await chapters.nth(1).click()
    await chapters.nth(2).click()
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(250)
    await page.getByRole('checkbox', { name: '跨卷去重' }).check()
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(250)
    const scoreInput = page.getByRole('spinbutton', { name: '数值，单位分', exact: true })
    const durationInput = page.getByRole('spinbutton', { name: '数值，单位分钟', exact: true })
    await scoreInput.fill('120')
    await scoreInput.press('Tab')
    await durationInput.fill('100')
    await durationInput.press('Tab')
    await page.getByRole('button', { name: /生成试卷/ }).click()

    await Promise.race([
      page.locator('.preview-screen').waitFor({ timeout: 30000 }),
      page.locator('.failure-dialog').waitFor({ timeout: 30000 })
    ])
    if (await page.locator('.failure-dialog').count()) {
      throw new Error(await page.locator('.failure-dialog').textContent())
    }
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(artifacts, 'generated-preview.png'), fullPage: true })
    const questionCount = await page
      .locator('.paper-preview-list .preview-question')
      .count()
    console.log('PREVIEW_QUESTIONS', questionCount)

    await page.getByRole('button', { name: /整卷再拔高/ }).click()
    await Promise.race([
      page.getByText(/已完成整卷拔高/).waitFor({ timeout: 30000 }),
      page.locator('.side-error').waitFor({ timeout: 30000 })
    ])
    if (await page.locator('.side-error').count()) {
      throw new Error(await page.locator('.side-error').textContent())
    }
    console.log('HARDEN_PAPER OK')

    await page.locator('.edit-question-button').first().click({ force: true })
    await page.waitForTimeout(150)
    await page.screenshot({ path: path.join(artifacts, 'question-editor.png'), fullPage: true })
    await page.getByRole('button', { name: /^再拔高$/ }).click()
    await page.getByText(/本题已拔高并独立复核/).waitFor({ timeout: 30000 })
    console.log('HARDEN_QUESTION OK')
    await page.getByRole('button', { name: /关闭编辑/ }).click()

    await page.getByRole('button', { name: /导出到文档/ }).click()
    await page.locator('.export-result').waitFor({ timeout: 30000 })
    const exportText = await page.locator('.export-result').textContent()
    console.log('EXPORT_RESULT', exportText)

    await page.getByRole('button', { name: /试卷库/ }).first().click()
    await page.locator('.paper-row').first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(artifacts, 'library-with-paper.png'), fullPage: true })
    console.log('LIBRARY_ROWS', await page.locator('.paper-row').count())
    await page.getByRole('button', { name: /本地题库/ }).first().click()
    await page.locator('.bank-row').first().waitFor({ timeout: 10000 })
    console.log('BANK_ROWS', await page.locator('.bank-row').count())
    console.log('FULL FLOW OK')
  } finally {
    await electronApp.close()
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(testData, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(testOutput, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

