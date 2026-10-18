const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

const GEOMETRY = {
  template: 'custom_geometry',
  geometry: {
    points: [
      { id: 'A', label: 'A', x: 22, y: 22 },
      { id: 'B', label: 'B', x: 82, y: 22 },
      { id: 'C', label: 'C', x: 22, y: 78 }
    ],
    segments: [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' }
    ],
    rightAngles: [{ vertex: 'A', from: 'B', to: 'C' }],
    annotations: []
  }
}

const PROOF_GEOMETRY = {
  template: 'custom_geometry',
  geometry: {
    points: [
      { id: 'A', label: 'A', x: 50, y: 84 },
      { id: 'B', label: 'B', x: 18, y: 20 },
      { id: 'C', label: 'C', x: 82, y: 20 },
      { id: 'D', label: 'D', x: 34, y: 52 },
      { id: 'E', label: 'E', x: 66, y: 52 }
    ],
    segments: [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
      { from: 'B', to: 'E' }
    ],
    rightAngles: [],
    annotations: []
  }
}

function itemsFor(prompt, count) {
  const type = prompt.includes('题型：single_choice')
    ? 'single_choice'
    : prompt.includes('题型：fill_blank')
      ? 'fill_blank'
      : prompt.includes('题型：calculation')
        ? 'calculation'
        : prompt.includes('题型：proof')
          ? 'proof'
          : prompt.includes('题型：application')
            ? 'application'
            : 'solution'
  const slots = [...prompt.matchAll(/章节ID ([a-zA-Z0-9-]+)，难度 (\d+)\/10/g)]

  return Array.from({ length: count }, (_, index) => {
    const chapterId = slots[index]?.[1] ?? 'renjiao-7-a-1'
    const difficulty = Number(slots[index]?.[2] ?? 6)
    const base = { slot: index + 1, chapterId, difficulty }
    const item = buildItem(type, base, index)
    return { ...item, stem: `${item.stem}（第 ${index + 1} 组）` }
  })
}

function buildItem(type, base, index) {
    if (type === 'single_choice') {
      return {
        ...base,
        knowledgePoint: '不等式性质',
        stem: `已知 $a<b$，且 $c<0$，则下列不等式一定成立的是（　）`,
        options: [
          { key: 'A', text: '$ac<bc$' },
          { key: 'B', text: '$a+c<b+c$' },
          { key: 'C', text: '$\\frac{a}{c}<\\frac{b}{c}$' },
          { key: 'D', text: '$a^2<b^2$' }
        ],
        answer: 'B',
        explanation:
          '不等式两边同加同一个数，不等号方向不变，因此 $a+c<b+c$。$c<0$ 时乘除会变号，故 A、C 错误；平方不一定保持大小，故 D 错误。'
      }
    }

    if (type === 'fill_blank') {
      return {
        ...base,
        knowledgePoint: '二次根式与分式',
        stem: `若 $\\frac{x}{2}+\\sqrt{3}=0$，则 $x=$ ______；若 $|m-2|=3$，则 $m=$ ______。`,
        options: [],
        answer: '$x=-2\\sqrt{3}$；$m=5$ 或 $m=-1$',
        explanation:
          '由 $\\frac{x}{2}=-\\sqrt{3}$ 得 $x=-2\\sqrt{3}$。由绝对值定义得 $m-2=3$ 或 $m-2=-3$，解得 $m=5$ 或 $m=-1$。'
      }
    }

    if (type === 'calculation') {
      return {
        ...base,
        knowledgePoint: '勾股定理',
        stem: `如图，在 $\\triangle ABC$ 中，$\\angle A=90^\\circ$，$AB=6$，$AC=8$。求 $BC$ 的长，并求 $\\triangle ABC$ 的面积。`,
        options: [],
        answer: '$BC=10$，面积为 $24$',
        explanation:
          '由勾股定理 $BC^2=AB^2+AC^2=36+64=100$，所以 $BC=10$。面积 $S=\\frac{1}{2}\\times 6\\times 8=24$。',
        figure: GEOMETRY
      }
    }

    if (type === 'proof') {
      return {
        ...base,
        knowledgePoint: '全等三角形',
        stem: `如图，在 $\\triangle ABC$ 中，$AB=AC$，点 $D$、$E$ 分别在 $AB$、$AC$ 上，且 $BD=CE$。求证：$CD=BE$。`,
        options: [],
        answer: '证明见解析',
        explanation:
          '因为 $AB=AC$，所以 $\\angle ABC=\\angle ACB$。又 $BC=CB$，$BD=CE$，由 SAS 得 $\\triangle BCD\\cong\\triangle CBE$。所以 $CD=BE$。',
        figure: PROOF_GEOMETRY
      }
    }

    if (type === 'application') {
      return {
        ...base,
        knowledgePoint: '一元一次方程应用',
        stem: `某商店购进一批文具，每件进价 $12$ 元，按标价的八折出售，仍可获利 $20\\%$。求每件文具的标价。`,
        options: [],
        answer: '$18$ 元',
        explanation:
          '设标价为 $x$ 元，则售价为 $0.8x$。由利润率得 $0.8x-12=12\\times 20\\%$，即 $0.8x=14.4$，解得 $x=18$。'
      }
    }

    return {
      ...base,
      knowledgePoint: '二次函数',
      stem: `如图，抛物线 $y=x^2-2x-3$ 与 $x$ 轴交于 $A$、$B$ 两点，与 $y$ 轴交于点 $C$。点 $P$ 是抛物线上一动点，求 $\\triangle PAB$ 面积的最大值。`,
      options: [],
      answer: '最大面积为 $8$',
      explanation:
        '令 $y=0$ 得 $x^2-2x-3=0$，解得 $x=-1$ 或 $x=3$，故 $AB=4$。点 $P$ 到 $x$ 轴的距离最大为顶点纵坐标的绝对值，顶点为 $(1,-4)$，高为 $4$。所以面积最大值为 $\\frac{1}{2}\\times 4\\times 4=8$。',
      figure: {
        template: 'function_curve',
        params: { xMin: -2, xMax: 4, curve: 'quadratic', a: 1, b: -2, c: -3 }
      }
    }
}

function mockPayload(prompt) {
  if (prompt.includes('重新命制一道')) {
    const label = prompt.match(/重新命制一道[^数]*数学(单选题|填空题|计算题|解答题|证明题|应用题)/)?.[1]
    const key =
      label === '单选题'
        ? 'single_choice'
        : label === '填空题'
          ? 'fill_blank'
          : label === '计算题'
            ? 'calculation'
            : label === '证明题'
              ? 'proof'
              : label === '应用题'
                ? 'application'
                : 'solution'
    return itemsFor(`题型：${key}`, 1)[0]
  }
  if (prompt.includes('第二轮强制拔高')) {
    const slots = [...prompt.matchAll(/"slot"\s*:\s*(\d+)/g)].map((m) => Number(m[1]))
    return { upgrades: [] }
  }
  if (prompt.includes('独立数学解题与审校员')) {
    return { corrections: [] }
  }
  const count = Number(prompt.match(/题目数量：(\d+)/)?.[1] ?? 0)
  return { items: itemsFor(prompt, count) }
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
      const payload = mockPayload(prompt)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
          usage: { prompt_tokens: 1200, completion_tokens: 900, total_tokens: 2100 }
        })
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const testData = path.join(__dirname, '.tmp-visual-data')
  const testOutput = path.join(__dirname, 'visual-output')
  await fs.rm(testData, { recursive: true, force: true })
  await fs.rm(testOutput, { recursive: true, force: true })
  const { server, baseUrl } = await startMockServer()
  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: root,
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
    await page.evaluate(async (url) => {
      await window.chujuan.saveSettings({
        profile: {
          id: 'default',
          name: '本地模拟',
          baseUrl: url,
          model: 'mock-model',
          authMode: 'user-key',
          timeoutMs: 30000,
          concurrency: 3,
          inputPricePerM: 2,
          outputPricePerM: 8
        }
      })
    }, baseUrl)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /七年级/ }).click()
    await page.getByRole('button', { name: /下一步/ }).click()
    const chapters = page.locator('.chapter-row')
    for (let index = 0; index < 4; index += 1) await chapters.nth(index).click()
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '6 种' }).click()
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /生成试卷/ }).click()
    await Promise.race([
      page.locator('.preview-screen').waitFor({ timeout: 60000 }),
      page.locator('.failure-dialog').waitFor({ timeout: 60000 })
    ])
    if (await page.locator('.failure-dialog').count()) {
      throw new Error(await page.locator('.failure-dialog').textContent())
    }
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /导出到文档/ }).click()
    await page.locator('.export-result').waitFor({ timeout: 60000 })
    const result = await page.locator('.export-result').textContent()
    console.log('EXPORT', result)
    await page.screenshot({
      path: path.join(__dirname, 'visual-output-preview.png'),
      fullPage: true
    })
  } finally {
    await electronApp.close()
    await new Promise((resolve) => server.close(resolve))
  }

  const files = []
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else files.push(full)
    }
  }
  await walk(testOutput)
  console.log(files.join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
