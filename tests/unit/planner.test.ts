import { describe, expect, it } from 'vitest'
import {
  CHAPTER_CATALOG,
  getChapters
} from '../../src/shared/curriculum'
import {
  allocateQuestionScores,
  createExamPlan
} from '../../src/main/services/planner'
import { sectionPrompt } from '../../src/main/services/prompt'
import type { ExamConfig } from '../../src/shared/schemas'

function config(overrides: Partial<ExamConfig> = {}): ExamConfig {
  return {
    grade: 8,
    edition: 'renjiao',
    chapterIds: ['renjiao-8-a-1', 'renjiao-8-a-2', 'renjiao-8-a-3'],
    pageCount: 4,
    difficulty: 6,
    typeCount: 4,
    types: ['single_choice', 'fill_blank', 'calculation', 'solution'],
    manualCounts: {},
    totalScore: 100,
    durationMinutes: 90,
    title: '八年级数学阶段检测',
    exportFormats: ['pdf', 'docx'],
    notes: '',
    avoidCrossPaperDuplicates: false,
    ...overrides
  }
}

describe('curriculum catalog', () => {
  it('contains all three editions and all three grades', () => {
    expect(CHAPTER_CATALOG.length).toBeGreaterThan(80)
    for (const edition of ['renjiao', 'beishida', 'suke'] as const) {
      for (const grade of [7, 8, 9] as const) {
        const chapters = getChapters(edition, grade)
        expect(chapters.length).toBeGreaterThanOrEqual(8)
        expect(new Set(chapters.map((chapter) => chapter.id)).size).toBe(chapters.length)
      }
    }
  })
})

describe('exam planner', () => {
  it('covers every selected chapter and honors difficulty distribution', () => {
    const plan = createExamPlan(config())
    expect(plan.totalQuestions).toBeGreaterThanOrEqual(3)
    expect(plan.totalScore).toBe(100)
    expect(plan.sections).toHaveLength(4)
    const assignedChapters = new Set(
      plan.sections.flatMap((section) => section.chapterIds)
    )
    expect(assignedChapters).toEqual(
      new Set(['renjiao-8-a-1', 'renjiao-8-a-2', 'renjiao-8-a-3'])
    )
    const difficulties = plan.sections.flatMap((section) => section.difficulties)
    expect(difficulties.every((value) => value >= 5 && value <= 7)).toBe(true)
    expect(difficulties).toContain(5)
    expect(new Set(difficulties).size).toBeGreaterThan(1)
  })

  it('allocates integer points that sum exactly to the requested total', () => {
    const scores = allocateQuestionScores(
      [
        'single_choice',
        'single_choice',
        'fill_blank',
        'calculation',
        'solution',
        'proof',
        'application'
      ],
      120
    )
    expect(scores).toHaveLength(7)
    expect(scores.every(Number.isInteger)).toBe(true)
    expect(scores.reduce((sum, value) => sum + value, 0)).toBe(120)
  })

  it('rejects content that cannot fit in the selected pages', () => {
    expect(() =>
      createExamPlan(
        config({
          pageCount: 1,
          chapterIds: getChapters('renjiao', 8).map((chapter) => chapter.id),
          typeCount: 6,
          types: [
            'single_choice',
            'fill_blank',
            'calculation',
            'solution',
            'proof',
            'application'
          ]
        })
      )
    ).toThrow(/页数|总分/)
  })

  it('adds a strict multi-step contract at maximum difficulty', () => {
    const hardConfig = config({
      difficulty: 10,
      title: '压轴难度测试'
    })
    const plan = createExamPlan(hardConfig)
    const prompt = sectionPrompt(hardConfig, plan.sections[0], plan.sections[0].difficulties)
    expect(prompt).toContain('中考压轴题硬性要求')
    expect(prompt).toContain('至少需要 5 个有效推理步骤')
    expect(prompt).toContain('分类讨论')
    expect(prompt).toContain('不能直接代入')
  })
})

