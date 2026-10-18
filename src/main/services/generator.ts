import { randomUUID } from 'node:crypto'
import {
  paperSchema,
  type ExamConfig,
  type Paper,
  type PaperSection,
  type ProgressEvent,
  type ProviderProfile,
  type Question,
  type QuestionType,
  type TokenUsage
} from '../../shared/schemas'
import { isNearDuplicate } from '../../shared/fingerprint'
import { getSelectedChapters } from '../../shared/curriculum'
import { completeJson, parseJsonResponse } from './ai-client'
import {
  allocateQuestionScores,
  createExamPlan,
  sectionInstructions
} from './planner'
import {
  hardenSectionPrompt,
  questionRegeneratePrompt,
  repairPrompt,
  sectionPrompt,
  singleQuestionPrompt,
  systemPrompt,
  verifySectionPrompt
} from './prompt'
import {
  isItemPayloadError,
  materializeSection,
  normalizeStem,
  rawItems,
  validatePaper,
  validateRegeneratedQuestion
} from './validation'

export interface GenerateOptions {
  profile: ProviderProfile
  apiKey: string
  avoidStems?: string[]
  signal?: AbortSignal
  onProgress?: (event: ProgressEvent) => void
  onUsage?: (usage: TokenUsage) => void
  checkpoint?: GenerationCheckpoint
}

export interface GenerationCheckpoint {
  key: string
  sections: Map<number, PaperSection>
  onSection?: (index: number, section: PaperSection) => void
}

function maxTokensFor(type: QuestionType, count: number): number {
  const perQuestion: Record<QuestionType, number> = {
    single_choice: 850,
    fill_blank: 750,
    calculation: 900,
    solution: 1150,
    proof: 1250,
    application: 1150
  }
  return Math.min(16_000, Math.max(1_400, count * perQuestion[type] + 600))
}

export function estimateCost(usage: TokenUsage, profile: ProviderProfile): number {
  const input = (usage.promptTokens / 1_000_000) * (profile.inputPricePerM ?? 0)
  const output = (usage.completionTokens / 1_000_000) * (profile.outputPricePerM ?? 0)
  return Math.round((input + output) * 10000) / 10000
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      output[index] = await mapper(values[index], index)
    }
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  )
  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failure) throw failure.reason
  return output
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('已取消生成', 'AbortError')
}

interface RepairRequest<T> {
  options: GenerateOptions
  /** 实际发起请求的模型配置；复核/拔高时是 reviewer。 */
  profile: ProviderProfile
  system: string
  prompt: string
  maxTokens: number
  /** 首次结果不合法时，用错误信息构造第二次请求。 */
  repair: (rawText: string, error: string) => { prompt: string; maxTokens: number }
  parse: (value: unknown) => T
  failureMessage: (error: string) => string
  /** 某些结构性错误重试同一提示词没有意义，直接交给调用方降级处理。 */
  skipRepairFor?: (error: Error) => boolean
}

// 三段请求共用同一套「请求 → 解析 → 带错误重试一次」流程，差异只由调用方注入。
async function requestWithRepair<T>(spec: RepairRequest<T>): Promise<T> {
  const request = (prompt: string, maxTokens: number): Promise<string> =>
    completeJson(
      {
        profile: spec.profile,
        apiKey: spec.options.apiKey,
        signal: spec.options.signal,
        maxTokens,
        onUsage: spec.options.onUsage
      },
      spec.system,
      prompt
    )

  throwIfAborted(spec.options.signal)
  let rawText = await request(spec.prompt, spec.maxTokens)
  let lastError = new Error('AI 未返回可用的题目内容')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return spec.parse(parseJsonResponse(rawText))
    } catch (error) {
      lastError = error as Error
      if (attempt === 0) {
        if (spec.skipRepairFor?.(lastError)) break
        throwIfAborted(spec.options.signal)
        const next = spec.repair(rawText, lastError.message)
        rawText = await request(next.prompt, next.maxTokens)
      }
    }
  }
  // 保留原始错误类型，调用方可以据此决定是否降级重试。
  throw new Error(spec.failureMessage(lastError.message), { cause: lastError })
}

async function requestSection(
  config: ExamConfig,
  section: ReturnType<typeof createExamPlan>['sections'][number],
  options: GenerateOptions
): Promise<unknown> {
  const chapters = getSelectedChapters(config.chapterIds)
  const maxTokens = maxTokensFor(section.type, section.questionCount)
  try {
    const parsed = await requestWithRepair({
      options,
      profile: options.profile,
      system: systemPrompt(options.profile.reasoningEffort),
      prompt: sectionPrompt(config, section, section.difficulties),
      maxTokens,
      repair: (rawText, error) => ({
        prompt: repairPrompt(config, section, rawText, error),
        maxTokens: Math.min(16_000, Math.round(maxTokens * 1.5))
      }),
      parse: (value) => rawItems(value, section.questionCount, section.type, chapters),
      failureMessage: (error) => `${section.title}生成失败：${error}`,
      skipRepairFor: (error) =>
        isItemPayloadError(error) && error.problem !== 'count_mismatch'
    })
    return { parsed }
  } catch (error) {
    // 模型只吐题号或非题目内容时，整组重试往往仍会失败，改为逐题生成兜底。
    if (!isItemPayloadError((error as Error & { cause?: unknown }).cause)) throw error
    throwIfAborted(options.signal)
    options.onProgress?.({
      stage: 'generating',
      message: `${section.title}结构异常，改为逐题生成`
    })
    return { parsed: await generateSectionPerQuestion(config, section, options, chapters) }
  }
}

async function generateSectionPerQuestion(
  config: ExamConfig,
  section: ReturnType<typeof createExamPlan>['sections'][number],
  options: GenerateOptions,
  chapters: ReturnType<typeof getSelectedChapters>
): Promise<ReturnType<typeof rawItems>> {
  const slots = Array.from({ length: section.questionCount }, (_, index) => index)
  const generated = await mapWithConcurrency(
    slots,
    Math.min(2, options.profile.concurrency),
    async (index) => {
      throwIfAborted(options.signal)
      const chapterId = section.chapterIds[index] ?? section.chapterIds[0] ?? chapters[0]?.id
      if (!chapterId) throw new Error(`${section.title}缺少可用章节`)
      const difficulty = section.difficulties[index] ?? config.difficulty
      const basePrompt = singleQuestionPrompt(config, section, index + 1, difficulty, chapterId)
      const maxTokens = maxTokensFor(section.type, 1)
      const items = await requestWithRepair({
        options,
        profile: options.profile,
        system: systemPrompt(options.profile.reasoningEffort),
        prompt: basePrompt,
        maxTokens,
        repair: (rawText, error) => ({
          prompt: `${basePrompt}

上一次输出未通过校验：
${error}

上一次输出：
${rawText.slice(0, 4_000)}

请重新输出完整 JSON，items 中恰好 1 个题目对象。`,
          maxTokens: Math.min(8_000, Math.round(maxTokens * 1.5))
        }),
        parse: (value) => rawItems(value, 1, section.type, chapters, { allowAnySlot: true }),
        failureMessage: (error) => `${section.title}第 ${index + 1} 题生成失败：${error}`
      })
      return { ...items[0], slot: index + 1 }
    }
  )
  return rawItems({ items: generated }, section.questionCount, section.type, chapters)
}

function mergePatchItems(
  originalItems: ReturnType<typeof rawItems>,
  raw: unknown,
  expectedCount: number,
  type: QuestionType,
  chapters: ReturnType<typeof getSelectedChapters>
): ReturnType<typeof rawItems> {
  const value = raw as {
    items?: unknown
    upgrades?: unknown
    corrections?: unknown
  }
  if (Array.isArray(value.items)) {
    return rawItems(value, expectedCount, type, chapters)
  }

  const patches = value.upgrades ?? value.corrections
  if (!Array.isArray(patches)) {
    throw new Error('模型未返回 items、upgrades 或 corrections')
  }
  if (patches.length === 0) {
    return rawItems({ items: originalItems }, expectedCount, type, chapters)
  }

  const merged = originalItems.map((question) => ({ ...question }))
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('修改项格式不正确')
    }
    const value = patch as Record<string, unknown>
    const slot = Number(value.slot)
    if (!Number.isInteger(slot) || slot < 1 || slot > expectedCount) {
      throw new Error(`修改项 slot 超出范围：${String(value.slot)}`)
    }
    const { slot: _slot, reason: _reason, ...fields } = value
    merged[slot - 1] = {
      ...merged[slot - 1],
      ...fields
    }
  }
  return rawItems({ items: merged }, expectedCount, type, chapters)
}

async function hardenSectionItems(
  config: ExamConfig,
  section: ReturnType<typeof createExamPlan>['sections'][number],
  originalItems: ReturnType<typeof rawItems>,
  options: GenerateOptions
): Promise<ReturnType<typeof rawItems>> {
  const chapters = getSelectedChapters(config.chapterIds)
  const reviewer = {
    ...options.profile,
    model: options.profile.reviewModel?.trim() || options.profile.model,
    timeoutMs: Math.max(options.profile.timeoutMs, 180_000)
  }
  const prompt = hardenSectionPrompt(config, section, originalItems)
  return requestWithRepair({
    options,
    profile: reviewer,
    system: systemPrompt(reviewer.reasoningEffort),
    prompt,
    maxTokens: Math.min(8000, 900 + section.questionCount * 420),
    repair: (rawText, error) => ({
      prompt: `${prompt}

上一次拔高结果未通过校验：
${error}

上一次输出：
${rawText.slice(0, 12_000)}

请重新输出完整 JSON。`,
      maxTokens: Math.min(8000, 900 + section.questionCount * 420)
    }),
    parse: (value) =>
      mergePatchItems(originalItems, value, section.questionCount, section.type, chapters),
    failureMessage: (error) => `${section.title}难度拔高失败：${error}`
  })
}

async function verifySectionItems(
  config: ExamConfig,
  section: ReturnType<typeof createExamPlan>['sections'][number],
  items: ReturnType<typeof rawItems>,
  options: GenerateOptions
): Promise<ReturnType<typeof rawItems>> {
  const chapters = getSelectedChapters(config.chapterIds)
  const reviewer = {
    ...options.profile,
    model: options.profile.reviewModel?.trim() || options.profile.model,
    timeoutMs: Math.max(options.profile.timeoutMs, 180_000)
  }
  const prompt = verifySectionPrompt(config, section, items)
  const maxTokens = Math.min(8000, 700 + section.questionCount * 320)
  return requestWithRepair({
    options,
    profile: reviewer,
    system: systemPrompt(reviewer.reasoningEffort),
    prompt,
    maxTokens,
    repair: (rawText, error) => ({
      prompt: `${prompt}

上一次复核结果未通过校验：
${error}

上一次输出：
${rawText.slice(0, 12_000)}

请重新输出完整 JSON。`,
      maxTokens
    }),
    parse: (value) =>
      mergePatchItems(items, value, section.questionCount, section.type, chapters),
    failureMessage: (error) => `${section.title}答案复核失败：${error}`
  })
}

async function repairDuplicateQuestions(
  paper: Paper,
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
  forbiddenStems: Set<string> = new Set(),
  forbiddenCorpus: string[] = [],
  onUsage?: (usage: TokenUsage) => void
): Promise<void> {
  const seen = new Set<string>()
  const seenRaw: string[] = []
  let similarKept = 0
  for (let sectionIndex = 0; sectionIndex < paper.sections.length; sectionIndex += 1) {
    const section = paper.sections[sectionIndex]
    for (let questionIndex = 0; questionIndex < section.questions.length; questionIndex += 1) {
      const question = section.questions[questionIndex]
      const key = normalizeStem(question.stem)
      if (!seen.has(key) && !forbiddenStems.has(key)) {
        seen.add(key)
        seenRaw.push(question.stem)
        continue
      }
      try {
        const replacement = await generateSingleQuestion(
          paper,
          sectionIndex,
          questionIndex,
          profile,
          apiKey,
          signal,
          forbiddenStems,
          forbiddenCorpus,
          onUsage
        )
        section.questions[questionIndex] = replacement
        seen.add(normalizeStem(replacement.stem))
        seenRaw.push(replacement.stem)
      } catch (error) {
        if (signal?.aborted) throw error
        // Keep the original question rather than failing the whole paper.
        seenRaw.push(question.stem)
        similarKept += 1
      }
    }
  }
  if (similarKept > 0) {
    paper.plan.warnings = [
      ...paper.plan.warnings,
      `有 ${similarKept} 道题未能成功替换，仍与历史题目相近，请人工复核。`
    ]
  }
}

export async function generatePaper(
  config: ExamConfig,
  options: GenerateOptions
): Promise<Paper> {
  const effectiveProfile: ProviderProfile =
    config.difficulty >= 9
      ? {
          ...options.profile,
          timeoutMs: Math.max(options.profile.timeoutMs, 180_000)
        }
      : options.profile
  const usage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0
  }
  const trackUsage = (next: TokenUsage): void => {
    usage.promptTokens += next.promptTokens
    usage.completionTokens += next.completionTokens
    usage.totalTokens += next.totalTokens
    usage.requests += next.requests
    options.onUsage?.(next)
  }
  const effectiveOptions: GenerateOptions = {
    ...options,
    profile: effectiveProfile,
    onUsage: trackUsage
  }
  const plan = createExamPlan(config)
  const paperId = randomUUID()
  const typeSequence: QuestionType[] = plan.sections.flatMap((section) =>
    Array.from({ length: section.questionCount }, () => section.type)
  )
  const scoreSequence = allocateQuestionScores(typeSequence, config.totalScore)
  const scoreOffsets: number[] = []
  let scoreOffset = 0
  for (const section of plan.sections) {
    scoreOffsets.push(scoreOffset)
    scoreOffset += section.questionCount
  }
  const chapters = getSelectedChapters(config.chapterIds)
  let completedSections = 0

  options.onProgress?.({
    paperId,
    stage: 'preparing',
    message: '已完成试卷结构规划',
    current: 0,
    total: plan.sections.length
  })

  const generatedSections = await mapWithConcurrency(
    plan.sections,
    effectiveProfile.concurrency,
    async (planSection, sectionIndex) => {
      throwIfAborted(options.signal)
      const cached = options.checkpoint?.sections.get(sectionIndex)
      if (cached) {
        completedSections += 1
        options.onProgress?.({
          paperId,
          stage: 'generating',
          message: `复用已完成的${planSection.title}`,
          current: completedSections,
          total: plan.sections.length
        })
        return cached
      }
      options.onProgress?.({
        paperId,
        stage: 'generating',
        message: `正在生成${planSection.title}`,
        current: completedSections,
        total: plan.sections.length
      })
      const result = (await requestSection(config, planSection, effectiveOptions)) as {
        parsed: ReturnType<typeof rawItems>
      }
      if (config.difficulty >= 9) {
        options.onProgress?.({
          paperId,
          stage: 'generating',
          message: `正在第二轮拔高${planSection.title}`,
          current: completedSections,
          total: plan.sections.length
        })
        result.parsed = await hardenSectionItems(
          config,
          planSection,
          result.parsed,
          effectiveOptions
        )
      }
      if (effectiveProfile.answerReview) {
        options.onProgress?.({
          paperId,
          stage: 'validating',
          message: `正在独立验算${planSection.title}`,
          current: completedSections,
          total: plan.sections.length
        })
        result.parsed = await verifySectionItems(
          config,
          planSection,
          result.parsed,
          effectiveOptions
        )
      }
      const sectionScores = scoreSequence.slice(
        scoreOffsets[sectionIndex],
        scoreOffsets[sectionIndex] + planSection.questionCount
      )
      const section = materializeSection(
        result.parsed,
        planSection.type,
        planSection.title,
        sectionInstructions(planSection.type),
        planSection.chapterIds,
        planSection.difficulties,
        sectionScores,
        () => randomUUID()
      )
      options.checkpoint?.sections.set(sectionIndex, section)
      options.checkpoint?.onSection?.(sectionIndex, section)
      completedSections += 1
      options.onProgress?.({
        paperId,
        stage: 'generating',
        message: `已完成${planSection.title}`,
        current: completedSections,
        total: plan.sections.length
      })
      return section
    }
  )

  throwIfAborted(options.signal)
  options.onProgress?.({
    paperId,
    stage: 'validating',
    message: '正在检查题目、公式与重复内容'
  })

  const now = new Date().toISOString()
  const paper = paperSchema.parse({
    schemaVersion: 1,
    id: paperId,
    config,
    plan,
    sections: generatedSections,
    usage: {
      ...usage,
      estimatedCost: estimateCost(usage, effectiveProfile)
    },
    createdAt: now,
    updatedAt: now
  })

  await repairDuplicateQuestions(
    paper,
    effectiveProfile,
    options.apiKey,
    options.signal,
    new Set((options.avoidStems ?? []).map(normalizeStem)),
    options.avoidStems ?? [],
    trackUsage
  )
  validatePaper(paper)

  options.onProgress?.({
    paperId,
    stage: 'typesetting',
    message: '已完成校验，正在排版'
  })

  return paper
}

export async function generateSingleQuestion(
  paper: Paper,
  sectionIndex: number,
  questionIndex: number,
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
  forbiddenStems: Set<string> = new Set(),
  forbiddenCorpus: string[] = [],
  onUsage?: (usage: TokenUsage) => void
): Promise<Question> {
  const section: PaperSection | undefined = paper.sections[sectionIndex]
  const question = section?.questions[questionIndex]
  if (!section || !question) throw new Error('找不到需要重新生成的题目')

  let rawText = await completeJson(
    {
      profile:
        paper.config.difficulty >= 9
          ? { ...profile, timeoutMs: Math.max(profile.timeoutMs, 180_000) }
          : profile,
      apiKey,
      signal,
      maxTokens: 1800,
      onUsage
    },
    systemPrompt(profile.reasoningEffort),
    questionRegeneratePrompt(
      paper.config,
      question.type,
      question.difficulty,
      question.chapterId,
      question
    )
  )

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const replacement = validateRegeneratedQuestion(
        parseJsonResponse(rawText),
        question,
        question.chapterId,
        () => randomUUID()
      )
      const exists = paper.sections.some((candidate) =>
        candidate.questions.some(
          (item) =>
            item.id !== question.id &&
            normalizeStem(item.stem) === normalizeStem(replacement.stem)
        )
      )
      if (exists || forbiddenStems.has(normalizeStem(replacement.stem))) {
        throw new Error('新题与现有或历史题目重复')
      }
      if (isNearDuplicate(replacement.stem, forbiddenCorpus)) {
        if (attempt < 2) throw new Error('新题与历史题目高度相似，请换一个情境和数据')
      }
      return replacement
    } catch (error) {
      if (attempt === 2) throw error
      rawText = await completeJson(
        {
          profile:
            paper.config.difficulty >= 9
              ? { ...profile, timeoutMs: Math.max(profile.timeoutMs, 180_000) }
              : profile,
          apiKey,
          signal,
          maxTokens: 1800,
          onUsage
        },
        systemPrompt(profile.reasoningEffort),
        `${questionRegeneratePrompt(
          paper.config,
          question.type,
          question.difficulty,
          question.chapterId,
          question
        )}

上次输出无效：${(error as Error).message}
上次输出：${rawText.slice(0, 5000)}
请重新输出完整 JSON。`
      )
    }
  }
  throw new Error('单题重新生成失败')
}

export interface HardenScope {
  sectionIndex?: number
  questionIndex?: number
}

export async function hardenExistingPaper(
  paper: Paper,
  scope: HardenScope,
  options: GenerateOptions
): Promise<Paper> {
  const nextPaper = structuredClone(paper)
  const sectionIndexes =
    scope.sectionIndex === undefined
      ? nextPaper.sections.map((_section, index) => index)
      : [scope.sectionIndex]

  for (let order = 0; order < sectionIndexes.length; order += 1) {
    const sectionIndex = sectionIndexes[order]
    const section = nextPaper.sections[sectionIndex]
    const planSection = nextPaper.plan.sections[sectionIndex]
    if (!section || !planSection) {
      throw new Error('找不到需要拔高的题组')
    }

    const questionIndexes =
      scope.questionIndex === undefined
        ? section.questions.map((_question, index) => index)
        : [scope.questionIndex]
    const selectedQuestions = questionIndexes.map(
      (index) => section.questions[index]
    )
    if (selectedQuestions.some((question) => !question)) {
      throw new Error('找不到需要拔高的题目')
    }
    const validQuestions = selectedQuestions as Question[]

    const scopedPlan = {
      ...planSection,
      questionCount: validQuestions.length,
      chapterIds: validQuestions.map((question) => question.chapterId),
      difficulties: validQuestions.map((question) => question.difficulty)
    }
    const currentItems = validQuestions.map((question, index) => ({
      ...question,
      slot: index + 1
    }))

    options.onProgress?.({
      paperId: paper.id,
      stage: 'generating',
      message: `正在拔高${scope.questionIndex === undefined ? section.title : `第 ${scope.questionIndex + 1} 题`}`,
      current: order,
      total: sectionIndexes.length
    })

    let hardened = await hardenSectionItems(
      nextPaper.config,
      scopedPlan,
      currentItems,
      options
    )
    if (options.profile.answerReview) {
      options.onProgress?.({
        paperId: paper.id,
        stage: 'validating',
        message: `正在独立验算${scope.questionIndex === undefined ? section.title : `第 ${scope.questionIndex + 1} 题`}`,
        current: order,
        total: sectionIndexes.length
      })
      hardened = await verifySectionItems(
        nextPaper.config,
        scopedPlan,
        hardened,
        options
      )
    }

    const updatedSection = materializeSection(
      hardened,
      section.type,
      section.title,
      section.instructions,
      scopedPlan.chapterIds,
      scopedPlan.difficulties,
      validQuestions.map((question) => question.score),
      () => randomUUID()
    )

    if (scope.questionIndex === undefined) {
      updatedSection.id = section.id
      nextPaper.sections[sectionIndex] = updatedSection
    } else {
      nextPaper.sections[sectionIndex].questions[scope.questionIndex] =
        updatedSection.questions[0]
    }
  }

  nextPaper.updatedAt = new Date().toISOString()
  return validatePaper(nextPaper)
}

