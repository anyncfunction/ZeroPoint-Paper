const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const samplePaper = {
  schemaVersion: 1,
  id: 'smoke-paper-001',
  config: {
    grade: 8,
    edition: 'renjiao',
    chapterIds: ['renjiao-8-a-1', 'renjiao-8-a-2', 'renjiao-8-a-3'],
    pageCount: 2,
    difficulty: 6,
    typeCount: 4,
    types: ['single_choice', 'fill_blank', 'calculation', 'solution'],
    manualCounts: {},
    totalScore: 100,
    durationMinutes: 90,
    title: '八年级数学阶段检测',
    exportFormats: ['pdf', 'docx'],
    notes: '',
    avoidCrossPaperDuplicates: false
  },
  plan: {
    sections: [
      {
        type: 'single_choice',
        title: '单选题',
        questionCount: 2,
        scorePerQuestion: 8,
        chapterIds: ['renjiao-8-a-1', 'renjiao-8-a-2'],
        difficulties: [5, 6]
      },
      {
        type: 'fill_blank',
        title: '填空题',
        questionCount: 2,
        scorePerQuestion: 8,
        chapterIds: ['renjiao-8-a-3', 'renjiao-8-a-1'],
        difficulties: [6, 6]
      },
      {
        type: 'calculation',
        title: '计算题',
        questionCount: 2,
        scorePerQuestion: 14,
        chapterIds: ['renjiao-8-a-2', 'renjiao-8-a-1'],
        difficulties: [6, 6]
      },
      {
        type: 'solution',
        title: '解答题',
        questionCount: 2,
        scorePerQuestion: 20,
        chapterIds: ['renjiao-8-a-2', 'renjiao-8-a-3'],
        difficulties: [7, 7]
      }
    ],
    totalQuestions: 8,
    totalScore: 100,
    estimatedMinutes: 90,
    warnings: []
  },
  sections: [
    {
      id: 'section-1',
      type: 'single_choice',
      title: '单选题',
      instructions: '在每个小题给出的选项中，只有一项符合题目要求。',
      questions: [
        {
          id: 'q-1',
          type: 'single_choice',
          chapterId: 'renjiao-8-a-1',
          knowledgePoint: '三角形内角和',
          difficulty: 5,
          stem: '在 $\\triangle ABC$ 中，$\\angle A=50^\\circ$，$\\angle B=60^\\circ$，则 $\\angle C$ 的度数是（　）',
          options: [
            { key: 'A', text: '$50^\\circ$' },
            { key: 'B', text: '$60^\\circ$' },
            { key: 'C', text: '$70^\\circ$' },
            { key: 'D', text: '$80^\\circ$' }
          ],
          answer: 'C',
          explanation: '三角形内角和为 $180^\\circ$，所以 $\\angle C=180^\\circ-50^\\circ-60^\\circ=70^\\circ$。',
          score: 8
        },
        {
          id: 'q-2',
          type: 'single_choice',
          chapterId: 'renjiao-8-a-2',
          knowledgePoint: '全等三角形',
          difficulty: 6,
          stem: '已知 $AB=DE$，$AC=DF$，若要判定 $\\triangle ABC\\cong\\triangle DEF$，还可以添加的条件是（　）',
          options: [
            { key: 'A', text: '$\\angle A=\\angle D$' },
            { key: 'B', text: '$BC=EF$ 且 $\\angle B=\\angle E$' },
            { key: 'C', text: '$\\angle B=\\angle E$' },
            { key: 'D', text: '$AB\\parallel DE$' }
          ],
          answer: 'A',
          explanation: '两边及其夹角分别相等，可用 SAS 判定三角形全等。',
          score: 8
        }
      ]
    },
    {
      id: 'section-2',
      type: 'fill_blank',
      title: '填空题',
      instructions: '请将答案直接填写在横线上。',
      questions: [
        {
          id: 'q-3',
          type: 'fill_blank',
          chapterId: 'renjiao-8-a-3',
          knowledgePoint: '轴对称',
          difficulty: 6,
          stem: '点 $P(2,-3)$ 关于 $x$ 轴对称的点的坐标是 ______。',
          options: [],
          answer: '$(2,3)$',
          explanation: '关于 $x$ 轴对称时横坐标不变，纵坐标变为相反数。',
          score: 8
        },
        {
          id: 'q-4',
          type: 'fill_blank',
          chapterId: 'renjiao-8-a-1',
          knowledgePoint: '三角形三边关系',
          difficulty: 6,
          stem: '若三角形的两边长分别为 $3$ 和 $7$，第三边长为整数，则第三边长最大为 ______。',
          options: [],
          answer: '9',
          explanation: '第三边应小于 $3+7=10$，且大于 $7-3=4$，所以最大整数为 $9$。',
          score: 8
        }
      ]
    },
    {
      id: 'section-3',
      type: 'calculation',
      title: '计算题',
      instructions: '写出必要的计算过程。',
      questions: [
        {
          id: 'q-5',
          type: 'calculation',
          chapterId: 'renjiao-8-a-2',
          knowledgePoint: '全等三角形性质',
          difficulty: 6,
          stem: '已知 $\\triangle ABC\\cong\\triangle DEF$，$AB=8$，$BC=10$，$CA=6$，求 $\\triangle DEF$ 的周长。',
          options: [],
          answer: '$24$',
          explanation: '$\\triangle DEF$ 的三边分别为 $8,10,6$，周长为 $8+10+6=24$。',
          score: 14
        },
        {
          id: 'q-6',
          type: 'calculation',
          chapterId: 'renjiao-8-a-1',
          knowledgePoint: '三角形内角和',
          difficulty: 6,
          stem: '在 $\\triangle ABC$ 中，$\\angle A:\\angle B:\\angle C=1:2:3$，求三个内角的度数。',
          options: [],
          answer: '$\\angle A=30^\\circ$，$\\angle B=60^\\circ$，$\\angle C=90^\\circ$',
          explanation: '设三个角分别为 $x,2x,3x$，由 $6x=180^\\circ$ 得 $x=30^\\circ$。',
          score: 14
        }
      ]
    },
    {
      id: 'section-4',
      type: 'solution',
      title: '解答题',
      instructions: '写出必要的文字说明、证明过程或演算步骤。',
      questions: [
        {
          id: 'q-7',
          type: 'solution',
          chapterId: 'renjiao-8-a-2',
          knowledgePoint: '全等三角形判定',
          difficulty: 7,
          stem: '如图，点 $B,E,C,F$ 在同一直线上，$AB=DE$，$AC=DF$，$BE=CF$。求证：$\\triangle ABC\\cong\\triangle DEF$。',
          options: [],
          answer: '由 $BE=CF$ 得 $BC=EF$，再结合 $AB=DE$，$AC=DF$，根据 SSS 可得 $\\triangle ABC\\cong\\triangle DEF$。',
          explanation: '先由线段关系推出 $BC=EF$，再寻找三组对应边分别相等，使用 SSS 判定。',
          figure: {
            template: 'custom_geometry',
            params: {},
            geometry: {
              points: [
                { id: 'A', label: 'A', x: 10, y: 18 },
                { id: 'B', label: 'B', x: 88, y: 18 },
                { id: 'C', label: 'C', x: 48, y: 86 },
                { id: 'D', label: 'D', x: 72, y: 43 },
                { id: 'E', label: 'E', x: 31, y: 27 },
                { id: 'F', label: 'F', x: 38, y: 49 }
              ],
              segments: [
                { from: 'A', to: 'B', dashed: false },
                { from: 'B', to: 'C', dashed: false },
                { from: 'C', to: 'A', dashed: false },
                { from: 'A', to: 'D', dashed: true },
                { from: 'B', to: 'F', dashed: true }
              ],
              rightAngles: [],
              annotations: [{ x: 55, y: 28, text: '2:3' }]
            }
          },
          score: 20
        },
        {
          id: 'q-8',
          type: 'solution',
          chapterId: 'renjiao-8-a-3',
          knowledgePoint: '轴对称性质',
          difficulty: 7,
          stem: '在平面直角坐标系中，已知 $A(1,2)$、$B(4,2)$、$C(3,5)$，画出 $\\triangle ABC$ 关于 $x$ 轴对称的图形，并写出各对应点的坐标。',
          options: [],
          answer: '对应点分别为 $(1,-2)$、$(4,-2)$、$(3,-5)$。',
          explanation: '关于 $x$ 轴对称的点横坐标不变，纵坐标变为相反数。',
          score: 20
        }
      ]
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

async function main() {
  const artifacts = path.join(__dirname, 'artifacts')
  const testData = path.join(__dirname, '.tmp-smoke-data')
  const testOutput = path.join(artifacts, 'smoke-export')
  await fs.mkdir(artifacts, { recursive: true })
  await fs.rm(testData, { recursive: true, force: true })
  await fs.rm(testOutput, { recursive: true, force: true })
  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      LINGDIAN_E2E_MULTI: '1',
      LINGDIAN_E2E_HIDDEN: '1',
      LINGDIAN_DATA_DIR: testData,
      LINGDIAN_DOCUMENTS_DIR: testOutput
    }
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    console.log('TITLE', await page.title())
    console.log(
      'HEADING',
      await page.locator('.screen-heading h1').first().textContent()
    )

    const result = await page.evaluate(
      async (paper) => window.chujuan.exportPaper(paper, ['pdf', 'docx']),
      samplePaper
    )
    console.log('EXPORT', JSON.stringify(result, null, 2))

    const files = await Promise.all(
      result.files.map(async (file) => {
        const stat = await fs.stat(file)
        return { file: path.basename(file), size: stat.size }
      })
    )
    console.log('FILES', JSON.stringify(files, null, 2))
  } finally {
    await electronApp.close()
    await fs.rm(testData, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

