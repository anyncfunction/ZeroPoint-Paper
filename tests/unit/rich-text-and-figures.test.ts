import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  normalizeMathDelimiters,
  renderMathHtml
} from '../../src/shared/rich-text'
import { FigurePayloadError, rawItems, validateRegeneratedQuestion } from '../../src/main/services/validation'
import type { Chapter, Question } from '../../src/shared/schemas'
import { renderFigureSvg } from '../../src/shared/figures'

const chapters: Chapter[] = [
  {
    id: 'renjiao-9-a-1',
    edition: 'renjiao',
    grade: 9,
    volume: '上册',
    chapterNumber: 1,
    title: '一元二次方程',
    knowledgePoints: ['方程建立', '解法']
  }
]

function item(figure: Record<string, unknown>) {
  return {
    slot: 1,
    chapterId: 'renjiao-9-a-1',
    knowledgePoint: '一元二次方程',
    difficulty: 9,
    stem: '如图，在 $\\triangle ABC$ 中，点 $D$ 在 $BC$ 上，且 $a<b$。',
    options: [],
    answer: '$a<b$',
    explanation: '由 $a<b$ 可得结论。',
    figure
  }
}

describe('rich text rendering', () => {
  it('renders comparison symbols inside math without exposing entities', () => {
    const html = renderMathHtml('若 $a<b$，且 $a\\le b$。')
    const dom = new JSDOM(`<div id="root">${html}</div>`)
    const text = dom.window.document.querySelector('#root')?.textContent ?? ''
    expect(text).toContain('a<b')
    expect(text).not.toContain('a&lt;b')
  })

  it('keeps raw HTML safely escaped', () => {
    const html = renderMathHtml('<script>alert(1)</script>')
    const dom = new JSDOM(`<div id="root">${html}</div>`)
    expect(dom.window.document.querySelector('script')).toBeNull()
  })

  it('normalizes LaTeX parenthesis and bracket delimiters', () => {
    expect(normalizeMathDelimiters('点 \\(A\\) 满足 \\[x^2=1\\]')).toBe(
      '点 $A$ 满足 $x^2=1$'
    )
    const html = renderMathHtml('点 \\(A\\)')
    const dom = new JSDOM(`<div id="root">${html}</div>`)
    expect(dom.window.document.querySelector('#root')?.textContent).toContain('A')
    expect(dom.window.document.querySelector('#root')?.textContent).not.toContain('\\(')
  })
})

describe('figure validation', () => {
  it('accepts null for an unused figure', () => {
    const parsed = rawItems(
      {
        items: [
          {
            ...item({
              template: 'triangle',
              params: { kind: 'general' }
            }),
            stem: '已知 $a<b$，求 $a-b$ 的符号。',
            figure: null
          }
        ]
      },
      1,
      'fill_blank',
      chapters
    )
    expect(parsed[0].figure).toBeUndefined()
  })

  it.each([
    { template: 'coordinate_system' },
    { type: 'coordinatePlane' },
    { templateId: 'cartesian-plane' }
  ])('normalizes an unambiguous coordinate template alias: %j', (name) => {
    const question = {
      ...item({ ...name, params: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 } }),
      stem: '如图，在平面直角坐标系中，求点 $P(1,2)$ 到原点的距离。'
    }
    const figure = rawItems({ items: [question] }, 1, 'solution', chapters)[0].figure
    expect(figure?.template).toBe('coordinate_plane')
    expect(renderFigureSvg(figure!)).toContain('<svg')
  })

  it.each([null, {}, '', 'none', { template: 'none' }, { template: null }])('rejects a missing figure referenced by the stem: %j', (figure) => {
    expect(() => rawItems({ items: [{ ...item({}), figure }] }, 1, 'solution', chapters))
      .toThrow(FigurePayloadError)
  })

  it.each([{ template: 'none' }, { template: null }])('accepts a no-figure sentinel only for a self-contained question: %j', (figure) => {
    const question = { ...item(figure), stem: '已知 $a<b$，求 $a-b$ 的符号。' }
    expect(rawItems({ items: [question] }, 1, 'solution', chapters)[0].figure).toBeUndefined()
  })

  it('reports the unsupported template and identifies every affected question', () => {
    const questions = [1, 2].map((slot) => ({ ...item({ template: 'mystery_diagram', params: {} }), slot }))
    try {
      rawItems({ items: questions }, 2, 'solution', chapters)
      throw new Error('Expected a figure error')
    } catch (error) {
      expect(error).toBeInstanceOf(FigurePayloadError)
      expect((error as FigurePayloadError).slots).toEqual([1, 2])
      expect((error as FigurePayloadError).items).toHaveLength(2)
      expect((error as Error).message).toContain('mystery_diagram')
      expect((error as Error).message).toContain('配图模板')
    }
  })

  it('does not accept arbitrary SVG or invent geometry for an unsupported template', () => {
    expect(() => rawItems({ items: [item({ template: 'svg', svg: '<svg></svg>' })] }, 1, 'solution', chapters))
      .toThrow(/svg/)
    expect(() => rawItems({ items: [item({ template: 'geometry', params: {} })] }, 1, 'solution', chapters))
      .toThrow(/点、线段/)
  })

  it('removes the old figure when a regenerated question no longer needs it', () => {
    const original = { ...item({ template: 'triangle', params: { kind: 'general' } }), id: 'original', type: 'solution', score: 10 } as Question
    const replacement = validateRegeneratedQuestion({
      ...item({}), stem: '已知 $a<b$，求 $a-b$ 的符号。', figure: null
    }, original, chapters[0].id, () => 'replacement')
    expect(replacement.figure).toBeUndefined()
    expect(replacement.score).toBe(10)
  })

  it('rejects a simplified triangle when the question has auxiliary points', () => {
    expect(() =>
      rawItems(
        {
          items: [
            item({
              template: 'triangle',
              params: { kind: 'general' }
            })
          ]
        },
        1,
        'fill_blank',
        chapters
      )
    ).toThrow(/custom_geometry/)
  })

  it('accepts a controlled custom geometry with every referenced point', () => {
    const parsed = rawItems(
      {
        items: [
          item({
            template: 'custom_geometry',
            params: {},
            geometry: {
              points: [
                { id: 'A', label: 'A', x: 10, y: 20 },
                { id: 'B', label: 'B', x: 85, y: 20 },
                { id: 'C', label: 'C', x: 45, y: 85 },
                { id: 'D', label: 'D', x: 60, y: 20 }
              ],
              segments: [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' },
                { from: 'C', to: 'A' },
                { from: 'C', to: 'D', dashed: true }
              ],
              rightAngles: [],
              annotations: []
            }
          })
        ]
      },
      1,
      'fill_blank',
      chapters
    )
    expect(parsed[0].figure?.template).toBe('custom_geometry')
  })
})

