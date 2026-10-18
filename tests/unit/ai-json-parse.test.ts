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

  it('ignores prose after a complete JSON object', () => {
    expect(parseJsonResponse('{"items":[{"stem":"a"}]}\n以上是全部题目。')).toEqual({
      items: [{ stem: 'a' }]
    })
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

  it('repairs single-backslash LaTeX commands inside strings', () => {
    const raw = String.raw`{"items":[{"stem":"在 $\triangle ABC$ 中，$x \le 1$，$\frac{1}{2}$。"}]}`
    expect(parseJsonResponse(raw)).toEqual({
      items: [{ stem: '在 $\\triangle ABC$ 中，$x \\le 1$，$\\frac{1}{2}$。' }]
    })
  })

  it('keeps real newline escapes when they are not LaTeX', () => {
    expect(parseJsonResponse('{"stem":"第一行\\n第二行"}')).toEqual({
      stem: '第一行\n第二行'
    })
  })

  it('escapes raw newlines inside strings', () => {
    expect(parseJsonResponse('{"stem":"第一行\n第二行"}')).toEqual({
      stem: '第一行\n第二行'
    })
  })

  it('accepts full-width quotes around keys', () => {
    expect(parseJsonResponse('{“items”:[{“stem”:“a”}]}')).toEqual({
      items: [{ stem: 'a' }]
    })
  })

  it('includes a location hint for unrecoverable json', () => {
    expect(() => parseJsonResponse('{"items":[oops]}')).toThrow(/位置|格式不合法/)
  })

  it('repairs unescaped ascii quotes inside a string', () => {
    const raw = '{"items":[{"stem":"如图，"AB" 是直径，求 "CD" 的长。"}]}'
    expect(parseJsonResponse(raw)).toEqual({
      items: [{ stem: '如图，"AB" 是直径，求 "CD" 的长。' }]
    })
  })
})
