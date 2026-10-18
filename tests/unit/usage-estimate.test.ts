import { describe, expect, it } from 'vitest'
import { estimateGenerationUsage } from '../../src/renderer/src/lib/utils'
import { createExamPlan } from '../../src/main/services/planner'
import type { ExamConfig, ProviderProfile } from '../../src/shared/schemas'

function config(overrides: Partial<ExamConfig> = {}): ExamConfig {
  return {
    grade: 9,
    edition: 'renjiao',
    chapterIds: ['renjiao-9-a-1', 'renjiao-9-a-2'],
    pageCount: 4,
    difficulty: 7,
    typeCount: 4,
    types: ['single_choice', 'fill_blank', 'calculation', 'solution'],
    manualCounts: {},
    totalScore: 100,
    durationMinutes: 90,
    title: '九年级数学阶段检测',
    exportFormats: ['pdf', 'docx'],
    notes: '',
    avoidCrossPaperDuplicates: false,
    ...overrides
  }
}

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: 'local',
    name: '测试接口',
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
    authMode: 'user-key',
    timeoutMs: 90_000,
    concurrency: 3,
    reasoningEffort: 'medium',
    answerReview: false,
    monthlyTokenBudget: 0,
    inputPricePerM: 0,
    outputPricePerM: 0,
    ...overrides
  }
}

describe('generation usage estimate', () => {
  it('returns null without a plan', () => {
    expect(estimateGenerationUsage(null, 6, profile())).toBeNull()
  })

  it('counts one request per section and skips review cost when disabled', () => {
    const plan = createExamPlan(config())
    const estimate = estimateGenerationUsage(plan, 7, profile())
    expect(estimate).not.toBeNull()
    expect(estimate!.requests).toBe(plan.sections.length)
    expect(estimate!.promptTokens).toBeGreaterThan(0)
    expect(estimate!.completionTokens).toBeGreaterThan(0)
    expect(estimate!.costLow).toBeNull()
  })

  it('adds a review request and priced cost range when configured', () => {
    const plan = createExamPlan(config())
    const estimate = estimateGenerationUsage(
      plan,
      7,
      profile({ answerReview: true, inputPricePerM: 2, outputPricePerM: 8 })
    )
    expect(estimate!.requests).toBe(plan.sections.length + 1)
    expect(estimate!.costLow).toBeGreaterThan(0)
    expect(estimate!.costHigh!).toBeGreaterThan(estimate!.costLow!)
  })

  it('budgets more completion tokens for top difficulty', () => {
    const plan = createExamPlan(config())
    const easy = estimateGenerationUsage(plan, 4, profile())!
    const hard = estimateGenerationUsage(plan, 10, profile())!
    expect(hard.completionTokens).toBeGreaterThan(easy.completionTokens)
  })
})
