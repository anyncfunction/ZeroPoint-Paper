import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generatePaper, generateSingleQuestion } from '../../src/main/services/generator'
import type {
  ExamConfig,
  ProviderProfile
} from '../../src/shared/schemas'

let server: Server
let baseUrl = ''
const requests: Array<Record<string, unknown>> = []

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
  const single = prompt.includes('只命制 1 道')
  const count = single ? 1 : Number(prompt.match(/题目数量：(\d+)/)?.[1] ?? 0)
  const type = typeFromPrompt(prompt)
  const singleSlot = Number(prompt.match(/"slot":\s*(\d+)/)?.[1] ?? 1)
  const slots = single
    ? [...prompt.matchAll(/章节ID：([a-zA-Z0-9-]+)）\n题型：[a-z_]+\n难度：(\d+)\/10/g)]
    : [...prompt.matchAll(/章节ID ([a-zA-Z0-9-]+)，难度 (\d+)\/10/g)]
  const embeddedChapters = [
    ...prompt.matchAll(/"chapterId"\s*:\s*"([^"]+)"/g)
  ].map((match) => match[1])
  return Array.from({ length: count }, (_, index) => {
    const position = single ? singleSlot - 1 : index
    const chapterId =
      slots[index]?.[1] ??
      embeddedChapters[index] ??
      embeddedChapters[0] ??
      'renjiao-8-a-1'
    const difficulty = Number(slots[index]?.[2] ?? 6)
    return itemAt(position, type, chapterId, difficulty)
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
        max_tokens?: number
        model?: string
        thinking?: { type: string }
      }
      requests.push(parsed)
      const prompt = parsed.messages[1].content
      const maxTokens = parsed.max_tokens ?? 0
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
      if (prompt.includes('NUMERIC_ITEMS') && !prompt.includes('上一次输出未通过校验')) {
        // 模拟模型把 items 写成一串数字，触发一次带错误说明的重试。
        content = JSON.stringify({ items: items.map((_, index) => index + 1) })
      }
      if (prompt.includes('ALWAYS_NUMERIC') && prompt.includes('题目数量：')) {
        // 模拟整组生成始终只给题号，迫使系统降级为逐题生成。
        content = JSON.stringify({ items: items.map((_, index) => index + 1) })
      }
      if (prompt.includes('PROSE_PREFIX')) {
        // 模拟模型在 JSON 前写了解析说明，其中 LaTeX 花括号不应被当成 JSON 起点。
        content = `结果为 $\\frac{a+b+c}{|abc|}$ 的值为 3。\n${content}`
      }
      let finishReason = 'stop'
      let reasoningContent: string | undefined
      if (parsed.model === 'deepseek-flash' && parsed.thinking?.type !== 'disabled') {
        // Real API shape: final content is null, reasoning contains draft JSON.
        reasoningContent = '先检查条件，草稿：{"items":[1,2]}，还需要继续推理。'
        content = ''
        finishReason = 'length'
      }
      if (prompt.includes('EMPTY_ONCE') && !prompt.includes('上一次输出未通过校验')) {
        content = ''
      }
      if (prompt.includes('EMPTY_ALWAYS')) content = ''
      if (prompt.includes('THINKING_PROSE') && maxTokens < 9000) {
        // 模拟思考型模型把预算耗在散文上，输出被长度截断。
        content = '我们需要输出合法JSON。需要设计题目。不能包含解释外内容。要严格JSON。需要原创'
        finishReason = 'length'
      }
      if (prompt.includes('PROSE_TWICE') && !prompt.includes('第一个字符必须是 {')) {
        // 前两次只给思考过程，第三次极简提示才输出 JSON。
        content = '我们需要输出合法JSON。需要设计题目。需要原创、难度9，多步推理。'
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: finishReason,
              message: {
                content: content || null,
                reasoning_content: reasoningContent
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

  it('retries with a readable message when items contain numbers', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1', 'renjiao-7-a-2'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 2,
      types: ['single_choice', 'fill_blank'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '数字 items 修复测试',
      exportFormats: ['pdf'],
      notes: 'NUMERIC_ITEMS',
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
    const questions = paper.sections.flatMap((section) => section.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => typeof question.stem === 'string')).toBe(true)
  })

  it('ignores latex braces in prose before the json payload', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 1,
      types: ['single_choice'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '前置公式说明测试',
      exportFormats: ['pdf'],
      notes: 'PROSE_PREFIX',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 1,
      reasoningEffort: 'medium',
      answerReview: false
    }
    const paper = await generatePaper(config, { profile, apiKey: '' })
    const questions = paper.sections.flatMap((section) => section.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => question.stem.length > 0)).toBe(true)
  })

  it('falls back to per-question generation when the model keeps returning only slot numbers', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1', 'renjiao-7-a-2'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 2,
      types: ['single_choice', 'fill_blank'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '逐题兜底测试',
      exportFormats: ['pdf'],
      notes: 'ALWAYS_NUMERIC',
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
    const messages: string[] = []
    const paper = await generatePaper(config, {
      profile,
      apiKey: '',
      onProgress: (event) => messages.push(event.message)
    })
    const questions = paper.sections.flatMap((section) => section.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => question.stem.length > 2)).toBe(true)
    expect(questions.every((question) => question.answer.length > 0)).toBe(true)
    expect(messages.some((message) => message.includes('改为逐题生成'))).toBe(true)
  })

  it('retries with a bigger budget when the model spends tokens on thinking prose', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 1,
      types: ['single_choice'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '思考截断测试',
      exportFormats: ['pdf'],
      notes: 'THINKING_PROSE',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 1,
      reasoningEffort: 'medium',
      answerReview: false
    }
    const paper = await generatePaper(config, { profile, apiKey: '' })
    const questions = paper.sections.flatMap((section) => section.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => !question.stem.includes('我们需要输出'))).toBe(true)
  })

  it('keeps retrying per question when the model first answers with prose', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 1,
      types: ['single_choice'],
      manualCounts: {},
      totalScore: 100,
      durationMinutes: 90,
      title: '散文重试测试',
      exportFormats: ['pdf'],
      notes: 'ALWAYS_NUMERIC PROSE_TWICE',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test',
      name: 'Mock',
      baseUrl,
      model: 'mock-model',
      authMode: 'user-key',
      timeoutMs: 30_000,
      concurrency: 1,
      reasoningEffort: 'medium',
      answerReview: false
    }
    const paper = await generatePaper(config, { profile, apiKey: '' })
    const questions = paper.sections.flatMap((section) => section.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => question.stem.length > 2)).toBe(true)
    expect(questions.every((question) => question.answer.length > 0)).toBe(true)
  })

  it('recovers from reasoning-only responses in generation, hardening, review and regeneration', async () => {
    const config: ExamConfig = {
      grade: 7,
      edition: 'renjiao',
      chapterIds: ['renjiao-7-a-1'],
      pageCount: 2,
      difficulty: 10,
      typeCount: 1,
      types: ['single_choice'],
      manualCounts: { single_choice: 2 },
      totalScore: 100,
      durationMinutes: 90,
      title: '真实思考字段回归',
      exportFormats: ['pdf'],
      notes: '保持中考压轴要求',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test', name: 'DeepSeek', baseUrl, model: 'deepseek-flash',
      authMode: 'user-key', timeoutMs: 30_000, concurrency: 1,
      reasoningEffort: 'medium', answerReview: true
    }
    const start = requests.length
    const usage: number[] = []
    const progress: string[] = []
    const paper = await generatePaper(config, {
      profile, apiKey: '', onUsage: (next) => usage.push(next.requests),
      onProgress: (next) => progress.push(next.message)
    })
    expect(paper.sections[0].questions).toHaveLength(2)
    expect(paper.sections[0].questions.every((question) => question.difficulty >= 9)).toBe(true)
    expect(progress.filter((message) => message.includes('调整输出方式重试'))).toHaveLength(1)
    const replacement = await generateSingleQuestion(paper, 0, 0, profile, '')
    expect(replacement.answer).toBe('C')
    const sent = requests.slice(start)
    expect(sent).toHaveLength(6)
    expect(usage).toHaveLength(4)
    expect(sent[0].thinking).toEqual({ type: 'enabled' })
    expect(sent.slice(1, 4).every((request) => (request.thinking as { type: string }).type === 'disabled')).toBe(true)
    // Regeneration starts a fresh task; saved thinking settings still apply.
    expect(sent[4].thinking).toEqual({ type: 'enabled' })
    expect(sent[5].thinking).toEqual({ type: 'disabled' })
    expect(profile.reasoningEffort).toBe('medium')
    const retry = sent[1].messages as Array<{ content: string }>
    expect(retry[1].content).toContain('整体难度：10/10')
    expect(retry[1].content).toContain('保持中考压轴要求')
    expect(retry[1].content).not.toContain('草稿：')
  })

  it('repairs an empty response thrown by the client', async () => {
    const config: ExamConfig = {
      grade: 7, edition: 'renjiao', chapterIds: ['renjiao-7-a-1'],
      pageCount: 2, difficulty: 6, typeCount: 1, types: ['single_choice'],
      manualCounts: { single_choice: 2 }, totalScore: 100, durationMinutes: 90,
      title: '空正文重试', exportFormats: ['pdf'], notes: 'EMPTY_ONCE',
      avoidCrossPaperDuplicates: false
    }
    const profile: ProviderProfile = {
      id: 'test', name: 'Mock', baseUrl, model: 'mock-model',
      authMode: 'user-key', timeoutMs: 30_000, concurrency: 1,
      reasoningEffort: 'medium', answerReview: false
    }
    const start = requests.length
    expect((await generatePaper(config, { profile, apiKey: '' })).sections[0].questions).toHaveLength(2)
    expect(requests.length - start).toBe(2)

    const failedStart = requests.length
    await expect(generatePaper({ ...config, notes: 'EMPTY_ALWAYS' }, { profile, apiKey: '' }))
      .rejects.toThrow('单选题生成失败：AI 接口未返回内容')
    expect(requests.length - failedStart).toBe(2)
  })
})

