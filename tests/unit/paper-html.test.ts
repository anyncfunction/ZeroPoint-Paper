import { describe, expect, it } from 'vitest'
import { buildPaperHtml } from '../../src/main/export/html'
import {
  MIN_ANSWER_SPACE_SCALE,
  buildFlowItems,
  packWithSpaceFit
} from '../../src/shared/pagination'
import type { Paper } from '../../src/shared/schemas'

function paper(): Paper {
  return {
    schemaVersion: 1,
    id: 'paper-html-test',
    config: {
      grade: 8,
      edition: 'renjiao',
      chapterIds: ['renjiao-8-a-1'],
      pageCount: 2,
      difficulty: 6,
      typeCount: 1,
      types: ['single_choice'],
      manualCounts: {},
      totalScore: 10,
      durationMinutes: 45,
      capstoneCount: 0,
      calculationLoad: 3,
      thinkingLoad: 3,
      answerSpace: 'standard',
      includeAnswerSheet: false,
      title: '排版测试卷',
      exportFormats: ['pdf'],
      notes: '',
      avoidCrossPaperDuplicates: false
    },
    plan: {
      sections: [],
      totalQuestions: 2,
      totalScore: 10,
      estimatedMinutes: 45,
      warnings: []
    },
    sections: [
      {
        id: 'section-1',
        type: 'single_choice',
        title: '单选题',
        instructions: '选出正确选项。',
        questions: [1, 2].map((index) => ({
          id: `q-${index}`,
          type: 'single_choice' as const,
          chapterId: 'renjiao-8-a-1',
          knowledgePoint: '三角形',
          difficulty: 6,
          stem: `第 ${index} 题：已知 $a<b$，下列结论正确的是（　）`,
          options: [
            { key: 'A', text: '$a+1<b+1$' },
            { key: 'B', text: '$a-1>b-1$' }
          ],
          answer: 'A',
          explanation: '不等式两边同加同一个数，不等号方向不变。',
          score: 5
        }))
      }
    ],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      estimatedCost: 0
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }
}

describe('paper html pagination', () => {
  it('keeps a single forced page break per page', async () => {
    const html = await buildPaperHtml(paper())
    expect(html).toContain('page-break-after: always;')
    expect(html).not.toMatch(/[;\s]break-after:\s*(page|auto);/)
  })

  it('renders one section per page block', async () => {
    const html = await buildPaperHtml(paper())
    expect(html.match(/<section class="page">/g)).toHaveLength(2)
  })
})

describe('answer space fitting', () => {
  it('never shrinks answer space below the floor', () => {
    const flowItems = buildFlowItems(paper())
    const fixedHeights = flowItems.map(() => 900)
    const spaceHeights = flowItems.map(() => 100)
    const fitted = packWithSpaceFit(flowItems, fixedHeights, spaceHeights, 1)
    expect(fitted.overflow).toBe(true)
    expect(fitted.spaceScale).toBe(MIN_ANSWER_SPACE_SCALE)
  })
})
