const { _electron: electron } = require('playwright')
const path = require('node:path')

async function main() {
  const executablePath =
    process.env.LINGDIAN_EXE ||
    path.resolve(__dirname, '../../release/win-unpacked/零点出卷.exe')
  const electronApp = await electron.launch({
    executablePath,
    args: [],
    env: {
      ...process.env,
      LINGDIAN_E2E_MULTI: '1',
      LINGDIAN_E2E_HIDDEN: '1'
    }
  })
  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
    console.log('PACKAGED_TITLE', await page.title())
    console.log(
      'PACKAGED_HEADING',
      await page.locator('.screen-heading h1').first().textContent()
    )
    console.log(
      'PACKAGED_CSS',
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    )
    console.log(
      'PACKAGED_VERSION',
      (await page.evaluate(() => window.chujuan.getAppInfo())).version
    )

  } finally {
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

