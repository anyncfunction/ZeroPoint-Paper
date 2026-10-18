import katex from 'katex'
import { z } from 'zod'
import { normalizeMathDelimiters } from '../../shared/rich-text'
import { normalizeStem } from '../../shared/fingerprint'
import {
  figureSpecSchema,
  optionSchema,
  paperSchema,
  type Chapter,
  type Paper,
  type PaperSection,
  type Question,
  type QuestionType
} from '../../shared/schemas'

const RawItemSchema = z.object({
  slot: z.number().int().positive().optional(),
  chapterId: z.string().optional(),
  knowledgePoint: z.string().min(1),
  difficulty: z.number().int().min(1).max(10).optional(),
  stem: z.string().min(2),
  options: z.preprocess(
    (value) => value ?? [],
    z.array(optionSchema).default([])
  ),
  answer: z.string().min(1),
  explanation: z.string().min(1),
  figure: z.preprocess(
    (value) => (value === null ? undefined : value),
    figureSpecSchema.optional()
  )
})

const RawItemsSchema = z.object({
  questions: z.array(RawItemSchema).optional(),
  items: z.array(RawItemSchema).optional()
})

function assertMath(text: string): void {
  const expression = /\$([^$]+)\$/g
  for (const match of text.matchAll(expression)) {
    try {
      katex.renderToString(match[1], {
        throwOnError: true,
        strict: 'ignore'
      })
    } catch {
      throw new Error(`公式无法解析：$${match[1]}$`)
    }
  }
  if (/\b(?:TODO|TBD|略|待补充)\b/.test(text)) {
    throw new Error('题目中包含未完成内容')
  }
}

function pointLabels(text: string): Set<string> {
  const labels = new Set<string>()
  for (const match of text.matchAll(/\$([A-Z])\$/g)) labels.add(match[1])
  for (const match of text.matchAll(/\\triangle\s*([A-Z]{2,6})/g)) {
    for (const label of match[1]) labels.add(label)
  }
  return labels
}

function validateFigure(item: z.infer<typeof RawItemSchema>): void {
  if (!item.figure) return
  const geometryReference = /如图|图形|图像|函数|数轴|坐标系|三角形|四边形|正方形|长方形|矩形|菱形|平行四边形|圆|折叠|交点|垂足|切线/.test(
    item.stem
  )
  if (!geometryReference) {
    throw new Error('题干没有需要图形的几何或函数情境，不能附加无关配图')
  }

  if (
    item.figure.template === 'triangle' ||
    item.figure.template === 'quadrilateral'
  ) {
    const labels = pointLabels(item.stem)
    const limit = item.figure.template === 'triangle' ? 3 : 4
    if (labels.size > limit) {
      throw new Error(
        '题干包含额外点、交点或辅助线，必须使用 custom_geometry 绘制完整几何图'
      )
    }
  }

  if (item.figure.template === 'custom_geometry' && item.figure.geometry) {
    const pointIds = new Set(
      item.figure.geometry.points.map((point) => point.id)
    )
    for (const label of pointLabels(item.stem)) {
      if (!pointIds.has(label)) {
        throw new Error(`配图缺少题干中的点 ${label}`)
      }
    }
  }
}

export { normalizeStem }

export type ItemPayloadProblem =
  /** 模型只返回了题号，例如 {"items":[1,2,3,4]} */
  | 'slot_numbers'
  /** 模型返回了数字/字符串等非对象元素 */
  | 'primitive_items'

export class ItemPayloadError extends Error {
  constructor(
    message: string,
    readonly problem: ItemPayloadProblem
  ) {
    super(message)
    this.name = 'ItemPayloadError'
  }
}

export function isItemPayloadError(error: unknown): error is ItemPayloadError {
  return error instanceof ItemPayloadError
}

const TYPE_LABELS: Record<string, string> = {
  number: '数字',
  string: '字符串',
  boolean: '布尔值',
  array: '数组',
  object: '对象',
  null: 'null',
  undefined: '空值'
}

const FIELD_LABELS: Record<string, string> = {
  slot: 'slot',
  chapterId: '章节 ID',
  knowledgePoint: '知识点',
  difficulty: '难度',
  stem: '题干',
  options: '选项',
  answer: '答案',
  explanation: '解析',
  figure: '配图'
}

// Zod 的 invalid_type 里 received 是类型名（number/string），不是实际值。
function receivedLabel(value: unknown): string {
  const type = String(value)
  return TYPE_LABELS[type] ?? type
}

// Zod 默认把问题列表序列化成 JSON，直接抛给用户既难读也看不出该改哪道题。
function describeIssues(error: z.ZodError): string {
  const parts = error.issues.slice(0, 4).map((issue) => {
    const [root, index, field] = issue.path
    const position =
      (root === 'items' || root === 'questions') && typeof index === 'number'
        ? `第 ${index + 1} 题`
        : ''
    const fieldLabel = typeof field === 'string' ? FIELD_LABELS[field] ?? field : ''
    if (issue.code === 'invalid_type') {
      if (position && !fieldLabel) {
        return `${position}应为题目对象，实际是${receivedLabel((issue as { received?: unknown }).received)}`
      }
      const target = [position, fieldLabel].filter(Boolean).join('的')
      return `${target || '字段'}应为${TYPE_LABELS[issue.expected] ?? issue.expected}`
    }
    if (issue.code === 'too_small' && fieldLabel) {
      return `${[position, fieldLabel].filter(Boolean).join('的')}不能为空`
    }
    return [position, fieldLabel, issue.message].filter(Boolean).join('：')
  })
  const detail = parts.join('；')
  const more = error.issues.length > parts.length ? ` 等 ${error.issues.length} 处问题` : ''
  return `AI 返回的题目结构不正确：${detail}${more}`
}

// 模型偶尔把题目包在对象映射、嵌套字段或字符串里，先还原成数组再校验。
function toItemArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return null
  if (entries.every(([, item]) => item && typeof item === 'object' && !Array.isArray(item))) {
    return entries
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, item]) => item)
  }
  return null
}

function coerceItem(item: unknown): unknown {
  if (typeof item !== 'string') return item
  const trimmed = item.trim()
  if (!trimmed.startsWith('{')) return item
  try {
    return JSON.parse(trimmed)
  } catch {
    return item
  }
}

function normalizeItemsPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) return { items: raw.map(coerceItem) }
  if (!raw || typeof raw !== 'object') return raw
  const record = raw as Record<string, unknown>
  // 单题生成时模型可能直接返回一个题目对象，没有包 items。
  if (typeof record.stem === 'string' && typeof record.answer === 'string') {
    return { items: [coerceItem(record)] }
  }
  const candidates = (['items', 'questions'] as const).map((key) => ({
    key,
    items: toItemArray(record[key])
  }))
  // 同一份输出里既有数字 items 又有真正的题目数组时，优先使用后者。
  const usable = candidates.find(
    (candidate) =>
      candidate.items &&
      candidate.items.some((item) => item && typeof item === 'object' && !Array.isArray(item))
  )
  if (usable?.items) {
    return { [usable.key]: usable.items.map(coerceItem) }
  }
  for (const candidate of candidates) {
    if (candidate.items) {
      return { [candidate.key]: candidate.items.map(coerceItem) }
    }
  }
  for (const key of ['data', 'result', 'list'] as const) {
    const items = toItemArray(record[key])
    if (items) return { items: items.map(coerceItem) }
  }
  return raw
}

// 在进入 Zod 之前先判断整体形状：只有题号或纯标量时，重试提示词要换一种说法。
function assertItemShapes(items: unknown[]): void {
  if (items.length === 0) return
  const objects = items.filter(
    (item) => item !== null && typeof item === 'object' && !Array.isArray(item)
  ).length
  if (objects === items.length) return
  if (objects > 0) {
    throw new ItemPayloadError(
      'AI 返回的题目列表里混有非题目内容，应全部为题目对象。',
      'primitive_items'
    )
  }
  const allNumbers = items.every((item) => typeof item === 'number')
  if (allNumbers) {
    throw new ItemPayloadError(
      `AI 只返回了题号（${items.join('、')}），没有返回题目内容。`,
      'slot_numbers'
    )
  }
  throw new ItemPayloadError('AI 返回的题目列表不是题目对象数组。', 'primitive_items')
}

export function rawItems(
  raw: unknown,
  expectedCount: number,
  type: QuestionType,
  chapters: Chapter[],
  options: { allowAnySlot?: boolean } = {}
): Array<z.infer<typeof RawItemSchema>> {
  const normalized = normalizeItemsPayload(raw)
  const normalizedRecord =
    normalized && typeof normalized === 'object'
      ? (normalized as Record<string, unknown>)
      : null
  const declared = normalizedRecord?.items ?? normalizedRecord?.questions
  if (Array.isArray(declared)) assertItemShapes(declared)
  const result = RawItemsSchema.safeParse(normalized)
  if (!result.success) {
    throw new Error(describeIssues(result.error))
  }
  const parsed = result.data
  const items = parsed.items ?? parsed.questions ?? []
  if (items.length !== expectedCount) {
    throw new Error(`题目数量应为 ${expectedCount}，实际为 ${items.length}`)
  }
  const chapterIds = new Set(chapters.map((chapter) => chapter.id))

  items.forEach((item, index) => {
    if (!options.allowAnySlot && item.slot !== undefined && item.slot !== index + 1) {
      throw new Error(`题目槽位顺序不正确，第 ${index + 1} 题的 slot 应为 ${index + 1}`)
    }
    if (item.chapterId && !chapterIds.has(item.chapterId)) {
      throw new Error(`第 ${index + 1} 题引用了未选择的章节`)
    }
    if (type === 'single_choice') {
      if (item.options.length !== 4) throw new Error('单选题必须包含 4 个选项')
      const keys = item.options.map((option) => option.key)
      if (new Set(keys).size !== 4 || keys.join('') !== 'ABCD') {
        throw new Error('单选题选项必须按 A、B、C、D 排列')
      }
      if (!keys.includes(item.answer.trim().toUpperCase())) {
        throw new Error('单选题答案必须对应一个选项')
      }
    } else if (item.options.length > 0) {
      throw new Error('非单选题不能包含选项')
    }
    item.stem = normalizeMathDelimiters(item.stem)
    item.answer = normalizeMathDelimiters(item.answer)
    item.explanation = normalizeMathDelimiters(item.explanation)
    for (const option of item.options) {
      option.text = normalizeMathDelimiters(option.text)
    }
    assertMath(item.stem)
    assertMath(item.answer)
    assertMath(item.explanation)
    validateFigure(item)
  })
  return items
}

export function materializeSection(
  rawItemsValue: Array<z.infer<typeof RawItemSchema>>,
  type: QuestionType,
  title: string,
  instructions: string,
  chapterIds: string[],
  difficulties: number[],
  scores: number[],
  idFactory: () => string
): PaperSection {
  return {
    id: idFactory(),
    type,
    title,
    instructions,
    questions: rawItemsValue.map((item, index) => ({
      id: idFactory(),
      type,
      chapterId: item.chapterId ?? chapterIds[index],
      knowledgePoint: item.knowledgePoint,
      difficulty: difficulties[index] ?? item.difficulty ?? 5,
      stem: item.stem,
      options: item.options,
      answer:
        type === 'single_choice' ? item.answer.trim().toUpperCase() : item.answer,
      explanation: item.explanation,
      ...(item.figure ? { figure: item.figure } : {}),
      score: scores[index] ?? 1
    }))
  }
}

export function validatePaper(paper: Paper): Paper {
  const parsed = paperSchema.parse(paper)
  const seen = new Set<string>()
  for (const section of parsed.sections) {
    for (const question of section.questions) {
      assertMath(question.stem)
      assertMath(question.answer)
      assertMath(question.explanation)
      const key = normalizeStem(question.stem)
      if (seen.has(key)) {
        throw new Error(`检测到重复题目：${question.stem.slice(0, 36)}`)
      }
      seen.add(key)
    }
  }
  const total = parsed.sections
    .flatMap((section) => section.questions)
    .reduce((sum, question) => sum + question.score, 0)
  if (total !== parsed.config.totalScore) {
    throw new Error(`分值合计为 ${total}，与设定总分 ${parsed.config.totalScore} 不一致`)
  }
  return parsed
}

export function validateRegeneratedQuestion(
  raw: unknown,
  original: Question,
  chapterId: string,
  idFactory: () => string
): Question {
  const item = RawItemSchema.parse(raw)
  const items = rawItems(
    { items: [{ ...item, slot: 1, chapterId }] },
    1,
    original.type,
    [{ id: chapterId } as Chapter]
  )
  assertMath(item.stem)
  return {
    ...original,
    id: idFactory(),
    chapterId,
    knowledgePoint: item.knowledgePoint,
    stem: item.stem,
    options: item.options,
    answer:
      original.type === 'single_choice'
        ? item.answer.trim().toUpperCase()
        : item.answer,
    explanation: item.explanation,
    ...(item.figure ? { figure: item.figure } : {})
  }
}

