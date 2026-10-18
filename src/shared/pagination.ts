import type { Paper, Question, QuestionType } from './schemas'

export type FlowItem =
  | {
      kind: 'section'
      sectionIndex: number
      title: string
      instructions: string
      totalScore: number
    }
  | {
      kind: 'question'
      sectionIndex: number
      questionIndex: number
      number: number
      sectionStarts: boolean
      totalScore: number
      question: Question
    }
  | {
      kind: 'spacer'
      heightMm: number
    }

export interface PageBlock {
  items: FlowItem[]
  usedMm: number
}

const CONTENT_HEIGHT_MM = 249
const FIRST_PAGE_CONTENT_HEIGHT_MM = 198

function plainLength(text: string): number {
  return text
    .replace(/\$[^$]*\$/g, 'MMM')
    .replace(/[^\x00-\xff]/g, '中')
    .length
}

function lineCount(text: string, width = 43): number {
  return Math.max(1, Math.ceil(plainLength(text) / width))
}

export function answerSpaceMm(type: QuestionType): number {
  switch (type) {
    case 'single_choice':
      return 5
    case 'fill_blank':
      return 11
    case 'calculation':
      return 27
    case 'solution':
      return 38
    case 'proof':
      return 44
    case 'application':
      return 35
  }
}

export function answerSpaceFactor(paper: Paper): number {
  switch (paper.config.answerSpace) {
    case 'compact':
      return 0.72
    case 'loose':
      return 1.32
    default:
      return 1
  }
}

function questionHeight(
  question: Question,
  scale: number,
  spaceScale = 1
): number {
  const stem = lineCount(question.stem) * 6 + 11
  const options =
    question.options.length > 0
      ? Math.ceil(question.options.length / 2) * 9
      : 0
  const figure = question.figure ? 68 : 0
  return stem + options + figure + answerSpaceMm(question.type) * scale * spaceScale + 7
}

function sectionHeight(): number {
  return 18
}

export function buildFlowItems(paper: Paper): FlowItem[] {
  const items: FlowItem[] = []
  let number = 0
  for (let sectionIndex = 0; sectionIndex < paper.sections.length; sectionIndex += 1) {
    const section = paper.sections[sectionIndex]
    const totalScore = section.questions.reduce(
      (sum, question) => sum + question.score,
      0
    )
    items.push({
      kind: 'section',
      sectionIndex,
      title: section.title,
      instructions: section.instructions,
      totalScore
    })
    for (let questionIndex = 0; questionIndex < section.questions.length; questionIndex += 1) {
      const question = section.questions[questionIndex]
      number += 1
      items.push({
        kind: 'question',
        sectionIndex,
        questionIndex,
        number,
        sectionStarts: questionIndex === 0,
        totalScore,
        question
      })
    }
  }
  return items
}

export function paginatePaper(
  paper: Paper,
  options: { allowOverflow?: boolean } = {}
): PageBlock[] {
  const target = paper.config.pageCount
  const scales = [
    1.4,
    1.25,
    1.1,
    1,
    0.9,
    0.8,
    0.7,
    0.6,
    0.5,
    0.42,
    0.35,
    0.28,
    0.22
  ]
  let selected: PageBlock[] = []
  const spaceScale = answerSpaceFactor(paper)

  for (const scale of scales) {
    const pages: PageBlock[] = []
    let page: PageBlock = { items: [], usedMm: 0 }
    const flowItems = buildFlowItems(paper)

    const push = (item: FlowItem, height: number, keepWithNext = 0): void => {
      const capacity =
        pages.length === 0 ? FIRST_PAGE_CONTENT_HEIGHT_MM : CONTENT_HEIGHT_MM
      if (page.usedMm + height + keepWithNext > capacity && page.items.length > 0) {
        pages.push(page)
        page = { items: [], usedMm: 0 }
      }
      if (height > CONTENT_HEIGHT_MM) {
        throw new Error('单道题内容过长，请编辑题目或增加到更多页数')
      }
      page.items.push(item)
      page.usedMm += height
    }

    for (let index = 0; index < flowItems.length; index += 1) {
      const item = flowItems[index]
      if (item.kind === 'section') {
        const next = flowItems[index + 1]
        const combinedFirst =
          next?.kind === 'question'
            ? questionHeight(next.question, scale, spaceScale) + sectionHeight()
            : 0
        push(item, sectionHeight(), combinedFirst)
      } else if (item.kind === 'question') {
        push(item, questionHeight(item.question, scale, spaceScale))
      }
    }
    if (page.items.length > 0) pages.push(page)
    selected = pages
    if (pages.length <= target) break
  }

  if (selected.length > target && !options.allowOverflow) {
    throw new Error(
      `题目排版后需要 ${selected.length} 页，超过设定的 ${target} 页。请减少题量或增加页数。`
    )
  }

  while (selected.length < target) {
    selected.push({
      items: [{ kind: 'spacer', heightMm: CONTENT_HEIGHT_MM }],
      usedMm: CONTENT_HEIGHT_MM
    })
  }

  const renderedPages = options.allowOverflow ? selected : selected.slice(0, target)
  return renderedPages.map((page) => ({
    ...page,
    items:
      page.usedMm < CONTENT_HEIGHT_MM && page.items.some((item) => item.kind !== 'spacer')
        ? page.items
        : page.items
  }))
}

export const A4_CONTENT_HEIGHT_MM = CONTENT_HEIGHT_MM

const FIRST_PAGE_BASE_PX = 805
const NEXT_PAGE_BASE_PX = 978

export function packMeasuredPages(
  flowItems: FlowItem[],
  heights: number[],
  targetPages: number
): PageBlock[] {
  const pages: PageBlock[] = []
  let current: FlowItem[] = []
  let used = 0
  let capacity = FIRST_PAGE_BASE_PX

  const finish = (): void => {
    if (current.length === 0) return
    pages.push({
      items: current,
      usedMm: (used * 25.4) / 96
    })
    current = []
    used = 0
    capacity = NEXT_PAGE_BASE_PX
  }

  for (let index = 0; index < flowItems.length; index += 1) {
    const item = flowItems[index]
    if (item.kind === 'section') {
      const next = flowItems[index + 1]
      const nextHeight =
        next?.kind === 'question' ? (heights[index + 1] ?? 0) : 0
      const groupHeight = (heights[index] ?? 0) + nextHeight
      if (current.length > 0 && used + groupHeight > capacity) finish()
      current.push(item)
      used += heights[index] ?? 0
      if (next?.kind === 'question') {
        current.push(next)
        used += heights[index + 1] ?? 0
        index += 1
      }
      continue
    }
    const height = heights[index] ?? 0
    if (current.length > 0 && used + height > capacity) finish()
    current.push(item)
    used += height
  }
  finish()

  while (pages.length < targetPages) {
    pages.push({
      items: [{ kind: 'spacer', heightMm: 220 }],
      usedMm: 220
    })
  }
  return pages
}

export interface SpaceFitResult {
  pages: PageBlock[]
  spaceScale: number
  overflow: boolean
}

export const MIN_ANSWER_SPACE_SCALE = 0.3

export function packWithSpaceFit(
  flowItems: FlowItem[],
  fixedHeights: number[],
  spaceHeights: number[],
  targetPages: number,
  minSpaceScale = MIN_ANSWER_SPACE_SCALE
): SpaceFitResult {
  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
    .filter((scale) => scale > minSpaceScale)
    .concat(minSpaceScale)
  let fallback: SpaceFitResult | null = null
  for (const spaceScale of scales) {
    const heights = fixedHeights.map(
      (fixed, index) => fixed + (spaceHeights[index] ?? 0) * spaceScale
    )
    const pages = packMeasuredPages(flowItems, heights, targetPages)
    if (pages.length <= targetPages) {
      return { pages, spaceScale, overflow: false }
    }
    fallback = { pages, spaceScale, overflow: true }
  }
  return fallback ?? {
    pages: packMeasuredPages(flowItems, fixedHeights, targetPages),
    spaceScale: 0,
    overflow: true
  }
}

