import { describe, expect, it } from 'vitest'
import {
  ItemPayloadError,
  isItemPayloadError,
  rawItems
} from '../../src/main/services/validation'
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

function item(index: number): Record<string, unknown> {
  return {
    slot: index + 1,
    chapterId: 'renjiao-9-a-1',
    knowledgePoint: '一元二次方程',
    difficulty: 6,
    stem: `第 ${index + 1} 题：解方程 $x^2-1=0$。`,
    options: [
      { key: 'A', text: '$1$' },
      { key: 'B', text: '$2$' },
      { key: 'C', text: '$3$' },
      { key: 'D', text: '$4$' }
    ],
    answer: 'A',
    explanation: '因式分解得 $(x-1)(x+1)=0$。'
  }
}

function parse(payload: unknown, count = 2) {
  return rawItems(payload, count, 'single_choice', chapters)
}

describe('item payload normalization', () => {
  it('reports numbers in items as a readable message instead of raw zod json', () => {
    expect(() => parse({ items: [1, 2] })).toThrow(/只返回了题号/)
    expect(() => parse({ items: [1, 2] })).not.toThrow(/invalid_type/)
  })

  it('classifies a pure slot number array', () => {
    try {
      parse({ items: [1, 2] })
      throw new Error('should have thrown')
    } catch (error) {
      expect(isItemPayloadError(error)).toBe(true)
      expect((error as ItemPayloadError).problem).toBe('slot_numbers')
    }
  })

  it('classifies mixed primitive items', () => {
    try {
      parse({ items: [item(0), 'oops'] })
      throw new Error('should have thrown')
    } catch (error) {
      expect(isItemPayloadError(error)).toBe(true)
      expect((error as ItemPayloadError).problem).toBe('primitive_items')
    }
  })

  it('accepts a single bare question object', () => {
    const items = rawItems(item(0), 1, 'single_choice', chapters)
    expect(items).toHaveLength(1)
  })

  it('accepts a root array of items', () => {
    const items = parse([item(0), item(1)])
    expect(items).toHaveLength(2)
  })

  it('accepts an object map keyed by slot number', () => {
    const items = parse({
      items: { '2': item(1), '1': item(0) }
    })
    expect(items.map((entry) => entry.slot)).toEqual([1, 2])
  })

  it('accepts items wrapped as json strings', () => {
    const items = parse({ items: [JSON.stringify(item(0)), JSON.stringify(item(1))] })
    expect(items).toHaveLength(2)
  })

  it('unwraps items nested under a data field', () => {
    const items = parse({ data: [item(0), item(1)] })
    expect(items).toHaveLength(2)
  })

  it('prefers real question objects over a numeric items array', () => {
    const items = parse({ items: [1, 2], questions: [item(0), item(1)] })
    expect(items.map((entry) => entry.slot)).toEqual([1, 2])
  })

  it('names the missing field in Chinese', () => {
    const broken = item(0) as Record<string, unknown>
    delete broken.stem
    expect(() => parse({ items: [broken, item(1)] })).toThrow(/第 1 题的题干/)
  })
})
