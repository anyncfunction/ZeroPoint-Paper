import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generatePaper } from '../../src/main/services/generator'
import type {
  ExamConfig,
  ProviderProfile
} from '../../src/shared/schemas'

let server: Server
let baseUrl = ''

function typeFromPrompt(prompt: string): string {
  if (prompt.includes('题型：single_choice') || prompt.includes('题型：单选题')) return 'single_choice'
  if (prompt.includes('题型：fill_blank') || prompt.includes('题型：填空题')) return 'fill_blank'
  if (prompt.includes('题型：calculation') || prompt.includes('题型：计算题')) return 'calculation'
  if (prompt.includes('题型：solution') || prompt.includes('题型：解答题')) return 'solution'
  return 'solution'
}

function itemAt(index: number, type: string, chapterId: string, difficulty: number): object {
  const group = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][index] ?? '子'
  const geometryQuestion = type === 'solution' && index === 0
  const typeWord: Record<string, string> = {
    single_choice: '选择',
    fill_blank: '填空',
    calculation: '计算',
    solution: '解答'
  }
  return {
    slot: index + 1,
    chapterId,
    knowledgePoint: `知识点${group}`,
    difficulty,
    stem: geometryQuestion
      ? `如图，在 $\\triangle ABC$ 中，点 $D$ 在 $BC$ 上，已知 $AB=6$，求线段 $AD$ 的长。`
      : `${typeWord[type] ?? '综合'}${group}题：已知 $x=${index + 2}$，求 $x+1$ 的值。`,
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
    explanation: `计算得 $x+1=${index + 3}$。`,
    ...(geometryQuestion
      ? {
          figure: {
            template: 'custom_geometry',
            params: {},
            geometry: {
              points: [
                { id: 'A', label: 'A', x: 15, y: 80 },
                { id: 'B', label: 'B', x: 10, y: 15 },
                { id: 'C', label: 'C', x: 85, y: 15 },
                { id: 'D', label: 'D', x: 55, y: 15 }
              ],
              segments: [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' },
                { from: 'C', to: 'A' },
                { from: 'A', to: 'D', dashed: true }
              ],
              rightAngles: [],
              annotations: []
            }
          }
        }
      : {})
  }
}

function mockItems(prompt: string): object[] {
  if (prompt.includes('重新命制一道')) {
    const type = prompt.includes('单选题')
      ? 'single_choice'
      : prompt.includes('填空题')
        ? 'fill_blank'
        : prompt.includes('计算题')
          ? 'calculation'
          : 'solution'
    const chapterId = prompt.match(/章节：.*\n/)?.[0]
    const chapterMatch = prompt.match(/- ([a-zA-Z0-9-]+):/)
    const difficulty = Number(prompt.match(/难度：(\d+)\/10/)?.[1] ?? 6)
    return [
      itemAt(
        9,
        type,
        chapterMatch?.[1] ?? 'renjiao-8-a-1',
        difficulty
      )
    ]
  }
  if (prompt.includes('第二轮强制拔高')) {
    const type = typeFromPrompt(prompt)
    const chapterIds = [...prompt.matchAll(/"chapterId"\s*:\s*"([^"]+)"/g)].map(
      (match) => match[1]
    )
    const slotNumbers = [...prompt.matchAll(/"slot"\s*:\s*(\d+)/g)].map((match) =>
      Number(match[1])
    )
    const count = Math.max(0, ...slotNumbers)
    return Array.from({ length: count }, (_, index) =>
      itemAt(
        index,
        type,
        chapterIds[index] ?? chapterIds[0] ?? 'renjiao-7-a-1',
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
  return Array.from({ length: count }, (_, index) => {
    const chapterId =
      slots[index]?.[1] ??
      embeddedChapters[index] ??
      embeddedChapters[0] ??
      'renjiao-8-a-1'
    const difficulty = Number(slots[index]?.[2] ?? 6)
    return itemAt(index, type, chapterId, difficulty)
  })
}

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const parsed = JSON.parse(body) as {
        messages: Array<{ content: string }>
      }
      const prompt = parsed.messages[1].content
      const items = mockItems(prompt)
      const payload = prompt.includes('重新命制一道')
        ? items[0]
        : prompt.includes('第二轮强制拔高')
          ? { upgrades: items }
          : prompt.includes('独立数学解题与审校员')
            ? { corrections: items.slice(0, 1) }
            : { items }
      let content = JSON.stringify(payload)
      if (prompt.includes('BROKEN_LATEX')) {
        // 模拟部分模型把 LaTeX 反斜杠只写一层，导致 JSON 转义非法。
        content = content.replace(/\\\\/g, '\\')
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content
              }
            }
          ]
        })
      )
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        baseUrl = `http://127.0.0.1:${address.port}/v1`
      }
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
})

describe('generation pipeline', () => {
  it('generates a validated paper from a compatible endpoint', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1', 'renjiao-7-a-2', 'renjiao-7-a-3'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 4,
      types: ['single_choice', 'fill_blank', 'calculation', 'solution'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '七年级数学阶段检测',
      exportFormats: ['pdf', 'docx'],
      notes: '增加基础题',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 3,
      reasoningEffort: 'medium',
      answerReview: true
    }
    const progress: string[] = []
    const paper = await generatePaper(config, {
      profile,
      apiKey: '',
      onProgress: (event) => progress.push(event.stage)
    })

    expect(paper.sections).toHaveLength(4)
    expect(paper.plan.totalQuestions).toBeGreaterThan(0)
    expect(
      paper.sections
        .flatMap((section) => section.questions)
        .reduce((sum, question) => sum + question.score, 0)
    ).toBe(100)
    expect(paper.sections.flatMap((section) => section.questions).every((question) => question.answer)).toBe(true)
    expect(progress).toContain('preparing')
    expect(progress).toContain('validating')
    expect(progress).toContain('typesetting')
  })

  it('runs a second hardening pass at maximum difficulty', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1', 'renjiao-7-a-2', 'renjiao-7-a-3'],
      pageCount: 2,
      difficulty: 10,
      typeCount: 3,
      types: ['single_choice', 'fill_blank', 'calculation'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '中考压轴测试',
      exportFormats: ['pdf'],
      notes: '',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 3,
      reasoningEffort: 'medium',
      answerReview: true
    }
    const messages: string[] = []
    const paper = await generatePaper(config, {
      profile,
      apiKey: '',
      onProgress: (event) => messages.push(event.message)
    })
    expect(paper.sections).toHaveLength(3)
    expect(messages.some((message) => message.includes('第二轮拔高'))).toBe(true)
    expect(messages.some((message) => message.includes('独立验算'))).toBe(true)
    const difficulties = paper.sections.flatMap((section) =>
      section.questions.map((question) => question.difficulty)
    )
    expect(difficulties.every((difficulty) => difficulty >= 9)).toBe(true)
    expect(difficulties.filter((difficulty) => difficulty === 10).length).toBe(2)
  })

  it('recovers when the model emits single-backslash LaTeX in json', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1', 'renjiao-7-a-2'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 2,
      types: ['single_choice', 'solution'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '转义修复测试',
      exportFormats: ['pdf'],
      notes: 'BROKEN_LATEX',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 2,
      reasoningEffort: 'medium',
      answerReview: false
    }
    const paper = await generatePaper(config, { profile, apiKey: '' })
    const stems = paper.sections.flatMap((section) =>
      section.questions.map((question) => question.stem)
    )
    expect(stems.some((stem) => stem.includes('\\triangle'))).toBe(true)
    expect(stems.every((stem) => !stem.includes('\t'))).toBe(true)
  })
})

