const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const artifacts = path.join(__dirname, 'artifacts')
  const testData = path.join(__dirname, '.tmp-error-flow-data')
  const testOutput = path.join(__dirname, '.tmp-error-flow-output')
  await fs.mkdir(artifacts, { recursive: true })
  await fs.rm(testData, { recursive: true, force: true })
  await fs.rm(testOutput, { recursive: true, force: true })

  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
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
    await page.evaluate(async () => {
      await window.chujuan.saveSettings({
        profile: {
          id: 'default',
          name: '不可用接口',
          baseUrl: 'http://127.0.0.1:9/v1',
          model: 'mock-model',
          authMode: 'user-key',
          timeoutMs: 30000,
          concurrency: 3
        }
      })
    })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.locator('.chapter-row').first().click()
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: /生成试卷/ }).click()
    await page.locator('.failure-dialog').waitFor({ timeout: 15000 })
    const title = await page.locator('.failure-dialog h2').textContent()
    const message = await page.locator('.failure-dialog > p').textContent()
    await page.screenshot({ path: path.join(artifacts, 'generation-error.png') })
    console.log(JSON.stringify({ title, message }, null, 2))
  } finally {
    await electronApp.close()
    await fs.rm(testData, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(testOutput, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

