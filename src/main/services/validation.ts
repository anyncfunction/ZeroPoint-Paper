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

export function rawItems(
  raw: unknown,
  expectedCount: number,
  type: QuestionType,
  chapters: Chapter[]
): Array<z.infer<typeof RawItemSchema>> {
  const parsed = RawItemsSchema.parse(raw)
  const items = parsed.items ?? parsed.questions ?? []
  if (items.length !== expectedCount) {
    throw new Error(`题目数量应为 ${expectedCount}，实际为 ${items.length}`)
  }
  const chapterIds = new Set(chapters.map((chapter) => chapter.id))

  items.forEach((item, index) => {
    if (item.slot !== undefined && item.slot !== index + 1) {
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

