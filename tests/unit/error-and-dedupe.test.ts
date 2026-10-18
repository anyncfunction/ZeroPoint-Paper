import { describe, expect, it } from 'vitest'
import { normalizeStem } from '../../src/main/services/validation'
import { explainGenerationFailure } from '../../src/renderer/src/lib/utils'

describe('question deduplication', () => {
  it('does not merge different numbers or formulas into a duplicate', () => {
    const first = normalizeStem('计算 $2+3$ 的值。')
    const second = normalizeStem('计算 $5+7$ 的值。')
    expect(first).not.toBe(second)
  })

  it('normalizes only whitespace and punctuation for exact duplicates', () => {
    expect(normalizeStem('计算 $2+3$ 的值。')).toBe(
      normalizeStem(' 计算$2+3$的值 ')
    )
  })
})

describe('generation error explanation', () => {
  it('explains certificate and proxy failures', () => {
    const failure = explainGenerationFailure(
      new Error('网络请求失败：SELF_SIGNED_CERT_IN_CHAIN')
    )
    expect(failure.title).toBe('HTTPS 证书验证失败')
    expect(failure.message).toContain('代理')
  })

  it('explains unavailable local endpoints', () => {
    const failure = explainGenerationFailure(
      new Error('网络请求失败：net::ERR_CONNECTION_REFUSED')
    )
    expect(failure.title).toBe('AI 接口拒绝连接')
  })

  it('explains exhausted thinking recovery without claiming no retry happened', () => {
    const failure = explainGenerationFailure(
      new Error('单选题生成失败：模型只返回了思考过程，没有输出题目 JSON')
    )
    expect(failure.title).toBe('模型没有输出题目')
    expect(failure.message).toContain('调整输出方式')
  })
})

