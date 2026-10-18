const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const artifacts = path.join(__dirname, 'artifacts')
  await fs.mkdir(artifacts, { recursive: true })
  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      LINGDIAN_E2E_MULTI: '1',
      LINGDIAN_DATA_DIR: path.join(__dirname, '.tmp-ui-flow-data'),
      LINGDIAN_DOCUMENTS_DIR: path.join(__dirname, '.tmp-ui-flow-output')
    }
  })
  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /八年级/ }).click()
    await page.getByRole('button', { name: /北师大版/ }).click()
    await page.screenshot({ path: path.join(artifacts, 'step-1.png'), fullPage: true })

    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(250)
    const chapterRows = page.locator('.chapter-row')
    await chapterRows.nth(0).click()
    await chapterRows.nth(1).click()
    await chapterRows.nth(2).click()
    await page.screenshot({ path: path.join(artifacts, 'step-2.png'), fullPage: true })

    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(artifacts, 'step-3.png'), fullPage: true })

    await page.getByRole('button', { name: /确定|下一步/ }).last().click().catch(() => undefined)
    const nextStep = page.getByRole('button', { name: /下一步/ })
    if (await nextStep.isVisible().catch(() => false)) await nextStep.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(artifacts, 'step-4.png'), fullPage: true })

    const usageEstimate = await page
      .locator('.summary-usage')
      .textContent()
      .catch(() => '')
    if (!usageEstimate || !usageEstimate.includes('tokens')) {
      throw new Error(`缺少生成前用量估算：${usageEstimate}`)
    }
    console.log('USAGE_ESTIMATE', usageEstimate.trim())

    await page.getByRole('button', { name: /AI 设置/ }).first().click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(artifacts, 'settings.png'), fullPage: true })

    await page.getByRole('button', { name: /试卷库/ }).first().click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(artifacts, 'library.png'), fullPage: true })

    console.log('UI FLOW OK')
  } finally {
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

