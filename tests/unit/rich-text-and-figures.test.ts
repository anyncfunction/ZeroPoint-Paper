import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  normalizeMathDelimiters,
  renderMathHtml
} from '../../src/shared/rich-text'
import { rawItems } from '../../src/main/services/validation'
import type { Chapter } from '../../src/shared/schemas'

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

