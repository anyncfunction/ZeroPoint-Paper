import {
  QUESTION_TYPE_LABELS,
  type ExamConfig,
  type ExamPlan,
  type QuestionType
} from '../../shared/schemas'
import { getSelectedChapters } from '../../shared/curriculum'
import { allocateQuestionScores } from '../../shared/scoring'

export { allocateQuestionScores }

const TYPE_UNITS: Record<QuestionType, number> = {
  single_choice: 1.1,
  fill_blank: 1,
  calculation: 2.2,
  solution: 2.9,
  proof: 3.7,
  application: 2.8
}

const INSTRUCTIONS: Record<QuestionType, string> = {
  single_choice: '在每个小题给出的选项中，只有一项符合题目要求。',
  fill_blank: '请将答案直接填写在横线上。',
  calculation: '写出必要的计算过程。',
  solution: '写出必要的文字说明、证明过程或演算步骤。',
  proof: '写出已知、求证，并给出完整证明过程。',
  application: '写出必要的建模和求解过程，并回答实际问题。'
}

const AUTO_TYPES: QuestionType[][] = [
  ['single_choice'],
  ['single_choice', 'fill_blank'],
  ['single_choice', 'fill_blank', 'calculation'],
  ['single_choice', 'fill_blank', 'calculation', 'solution'],
  ['single_choice', 'fill_blank', 'calculation', 'solution', 'application'],
  ['single_choice', 'fill_blank', 'calculation', 'solution', 'proof', 'application']
]

export function sectionInstructions(type: QuestionType): string {
  return INSTRUCTIONS[type]
}

function normalizeTypes(config: ExamConfig, chapterText: string): QuestionType[] {
  const configured = config.types.filter(
    (type, index, values) => values.indexOf(type) === index
  )
  if (configured.length > 0) {
    return configured.slice(0, config.typeCount)
  }

  let types = [...AUTO_TYPES[config.typeCount - 1]]
  const isGeometry = /三角形|全等|四边形|圆|相似|图形|勾股/.test(chapterText)
  if (isGeometry && !types.includes('proof') && config.typeCount >= 4) {
    types = types.filter((type) => type !== 'application').concat('proof')
  }
  return types.slice(0, config.typeCount)
}

function distributeCounts(
  types: QuestionType[],
  pages: number,
  chapterCount: number,
  manualCounts: Record<string, number>
): Record<QuestionType, number> {
  const counts = {} as Record<QuestionType, number>
  const targetUnits = Math.max(5.3, pages * 8.1)
  let remainingUnits = targetUnits

  for (const type of types) {
    const manual = manualCounts[type]
    counts[type] = manual ? Math.max(1, Math.round(manual)) : 1
    remainingUnits -= TYPE_UNITS[type] * counts[type]
  }

  const autoTypes = types.filter((type) => !manualCounts[type])
  const totalBaseUnits = autoTypes.reduce((sum, type) => sum + TYPE_UNITS[type], 0)

  if (remainingUnits > 0 && totalBaseUnits > 0) {
    for (const type of autoTypes) {
      const share = remainingUnits * (TYPE_UNITS[type] / totalBaseUnits)
      counts[type] += Math.max(0, Math.floor(share / TYPE_UNITS[type]))
    }
  }

  let total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const minimumForChapters = Math.max(chapterCount, types.length)

  while (total < minimumForChapters) {
    const candidate = autoTypes[total % Math.max(1, autoTypes.length)] ?? types[total % types.length]
    counts[candidate] += 1
    total += 1
  }

  return counts
}

function difficultiesFor(
  count: number,
  difficulty: number,
  capstoneCount = 0
): number[] {
  const values = Array.from({ length: count }, (_, index) => {
    const band = index % 5
    if (band === 0) return Math.max(1, difficulty - 1)
    if (band === 4) return Math.min(10, difficulty + 1)
    return difficulty
  })
  if (difficulty < 8) return values

  const capstones = Math.max(0, Math.min(count, capstoneCount))
  const regular = difficulty >= 9 ? 9 : difficulty
  const capstone = Math.min(10, regular + 1)
  for (let index = 0; index < count; index += 1) {
    values[index] = regular
  }
  for (let index = count - capstones; index < count; index += 1) {
    if (index >= 0) values[index] = capstone
  }
  return values
}

function chapterAssignments(chapters: string[], total: number): string[] {
  if (chapters.length === 0) return []
  return Array.from({ length: total }, (_, index) => chapters[index % chapters.length])
}

export function createExamPlan(config: ExamConfig): ExamPlan {
  const selectedChapters = getSelectedChapters(config.chapterIds)
  if (selectedChapters.length !== config.chapterIds.length) {
    throw new Error('章节选择中包含不存在的章节，请重新选择')
  }

  const chapterText = selectedChapters
    .map((chapter) => chapter.title)
    .join('、')
  const types = normalizeTypes(config, chapterText)
  const counts = distributeCounts(
    types,
    config.pageCount,
    selectedChapters.length,
    config.manualCounts
  )
  const totalQuestions = types.reduce((sum, type) => sum + counts[type], 0)
  if (totalQuestions > config.totalScore) {
    throw new Error(
      `当前题量为 ${totalQuestions} 题，总分至少需要 ${totalQuestions} 分。请减少题量或提高总分。`
    )
  }

  const estimatedUnits = types.reduce(
    (sum, type) => sum + TYPE_UNITS[type] * counts[type],
    0
  )
  const pageCapacity = config.pageCount * 8.7
  if (estimatedUnits > pageCapacity * 1.18) {
    throw new Error(
      `所选题型需要约 ${Math.ceil(estimatedUnits / 9.1)} 页，当前页数放不下。请增加页数、减少题型或题量。`
    )
  }

  const assignments = chapterAssignments(
    selectedChapters.map((chapter) => chapter.id),
    totalQuestions
  )
  const flatDifficulties = difficultiesFor(
    totalQuestions,
    config.difficulty,
    config.capstoneCount ?? 2
  )
  const warnings: string[] = []
  if (types.length > config.pageCount * 2) {
    warnings.push('题型数量较多，每种题型的题量会比较少。')
  }
  if (estimatedUnits > pageCapacity) {
    warnings.push('内容较满，系统会适当压缩答题留白以保持页数。')
  }
  if (config.difficulty >= 9) {
    warnings.push('高难模式会强制多步综合、知识联动和压轴级设问。')
  }
  if (config.avoidCrossPaperDuplicates) {
    warnings.push('已启用跨卷去重，会避开本地试卷库中已有的题干。')
  }

  let cursor = 0
  const scores = allocateQuestionScores(
    types.flatMap((type) => Array.from({ length: counts[type] }, () => type)),
    config.totalScore
  )
  const sections = types.map((type) => {
    const count = counts[type]
    const typeScores = scores.slice(cursor, cursor + count)
    cursor += count
    return {
      type,
      title: QUESTION_TYPE_LABELS[type],
      questionCount: count,
      scorePerQuestion: Math.max(1, Math.round(typeScores.reduce((a, b) => a + b, 0) / count)),
      chapterIds: assignments.slice(cursor - count, cursor),
      difficulties: flatDifficulties.slice(cursor - count, cursor)
    }
  })

  return {
    sections,
    totalQuestions,
    totalScore: scores.reduce((sum, score) => sum + score, 0),
    estimatedMinutes: config.durationMinutes,
    warnings
  }
}

export function typeUnitWeight(type: QuestionType): number {
  return TYPE_UNITS[type]
}

