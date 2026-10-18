import { describe, expect, it } from 'vitest'
import { parseJsonResponse } from '../../src/main/services/ai-client'

describe('AI JSON parsing', () => {
  it('accepts a fenced JSON object with surrounding prose', () => {
    const raw = '好的，结果如下：\n```json\n{"items":[{"stem":"a"}]}\n```\n请查收。'
    expect(parseJsonResponse(raw)).toEqual({ items: [{ stem: 'a' }] })
  })

  it('wraps a root array as an items object', () => {
    expect(parseJsonResponse('[{"stem":"a"}]')).toEqual({ items: [{ stem: 'a' }] })
  })

  it('tolerates trailing commas', () => {
    expect(parseJsonResponse('{"items":[{"stem":"a",},],}')).toEqual({
      items: [{ stem: 'a' }]
    })
  })

  it('closes a JSON object cut off after a complete item', () => {
    const raw = '{"items":[{"stem":"a","answer":"1"},{"stem":"b","ans'
    expect(parseJsonResponse(raw)).toEqual({ items: [{ stem: 'a', answer: '1' }] })
  })

  it('reports the beginning of non-JSON content', () => {
    expect(() => parseJsonResponse('抱歉，我无法完成。')).toThrow(/开头/)
  })
})
