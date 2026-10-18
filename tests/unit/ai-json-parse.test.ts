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

  it('names thinking prose as a thinking-only response', () => {
    const raw = '我们需要输出合法JSON。需要设计题目。不能包含解释外内容。'
    expect(() => parseJsonResponse(raw)).toThrow(/只输出了思考过程/)
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

  it('keeps newline escapes even when the next word looks like a latex command', () => {
    expect(parseJsonResponse('{"stem":"第一行\\nto be continued"}')).toEqual({
      stem: '第一行\nto be continued'
    })
  })

  it('still repairs latex escapes inside math when the command starts with n or t', () => {
    expect(parseJsonResponse(String.raw`{"stem":"若 $x \neq 1$ 且 $\triangle ABC$ 为等边三角形"}`)).toEqual({
      stem: '若 $x \\neq 1$ 且 $\\triangle ABC$ 为等边三角形'
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

  it('skips latex braces that appear before the json object', () => {
    const raw = String.raw`结果为 $\frac{a+b+c}{|abc|}$ 的值为 3。{"items":[{"stem":"a"}]}`
    expect(parseJsonResponse(raw)).toEqual({ items: [{ stem: 'a' }] })
  })

  it('finds the json object even when prose has several latex braces', () => {
    const raw = String.raw`设 $x\in\{1,2\}$，$y=\frac{a}{b}$，输出：{"items":[{"stem":"b"}]} 完毕。`
    expect(parseJsonResponse(raw)).toEqual({ items: [{ stem: 'b' }] })
  })

  it('does not treat a bare latex group as json', () => {
    expect(() => parseJsonResponse(String.raw`答案：\frac{a+b+c}{|abc|}\)`)).toThrow(/不是 JSON/)
  })
})
