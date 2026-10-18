import { promises as fs } from 'node:fs'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Math as WordMath,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
  Header
} from 'docx'
import { latexToMath } from 'docx/math'
import sharp from 'sharp'
import type { Paper, Question, QuestionType } from '../../shared/schemas'
import { chapterDisplayName, getSelectedChapters } from '../../shared/curriculum'
import { renderFigureSvg } from '../../shared/figures'
import { normalizeMathDelimiters } from '../../shared/rich-text'
import {
  answerSpaceFactor,
  paginatePaper,
  type FlowItem,
  type PageBlock
} from '../../shared/pagination'

const FONT = 'SimSun'
const FONT_EAST_ASIA = '宋体'
const FONT_SIZE = 21

type InlineChild = TextRun | WordMath

function textRun(text: string, options: { bold?: boolean; size?: number } = {}): TextRun {
  return new TextRun({
    text,
    font: { name: FONT, eastAsia: FONT_EAST_ASIA, hAnsi: FONT },
    size: options.size ?? FONT_SIZE,
    bold: options.bold
  })
}

function mathChildren(latex: string): InlineChild[] {
  try {
    return [
      new WordMath({
        children: latexToMath(latex)
      })
    ]
  } catch {
    return [textRun(latex, { size: FONT_SIZE })]
  }
}

function inlineChildren(text: string, options: { bold?: boolean; size?: number } = {}): InlineChild[] {
  const normalized = normalizeMathDelimiters(text)
  const children: InlineChild[] = []
  const pattern = /\$([^$]+)\$/g
  let cursor = 0
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) children.push(textRun(normalized.slice(cursor, index), options))
    children.push(...mathChildren(match[1]))
    cursor = index + match[0].length
  }
  if (cursor < normalized.length) children.push(textRun(normalized.slice(cursor), options))
  return children.length > 0 ? children : [textRun('')]
}

function paragraphsFor(text: string, options: { bold?: boolean; indent?: boolean } = {}): Paragraph[] {
  return text.split(/\n{2,}/).map(
    (part) =>
      new Paragraph({
        children: inlineChildren(part, { bold: options.bold }),
        spacing: { line: 330, after: 70 },
        indent: options.indent ? { firstLine: 420 } : undefined
      })
  )
}

function answerSpacePoints(type: QuestionType): number {
  switch (type) {
    case 'single_choice':
      return 0
    case 'fill_blank':
      return 220
    case 'calculation':
      return 1100
    case 'solution':
      return 1600
    case 'proof':
      return 1900
    case 'application':
      return 1450
  }
}

async function figureParagraph(question: Question): Promise<Paragraph | null> {
  if (!question.figure) return null
  const svg = renderFigureSvg(question.figure)
  const image = await sharp(Buffer.from(svg), { density: 220 })
    .resize({ width: 1100 })
    .png()
    .toBuffer()
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [
      new ImageRun({
        type: 'png',
        data: image,
        transformation: { width: 280, height: 134 },
        altText: {
          name: '数学配图',
          description: question.figure.caption ?? '数学示意图',
          title: '数学配图'
        }
      })
    ]
  })
}

function questionParagraph(
  item: Extract<FlowItem, { kind: 'question' }>
): Paragraph {
  const question = item.question
  return new Paragraph({
    children: [
      textRun(`${item.number}. `, { bold: true }),
      ...inlineChildren(question.stem)
    ],
    spacing: { before: item.sectionStarts ? 40 : 100, after: 70, line: 330 },
    keepNext: question.options.length > 0 || Boolean(question.figure),
    keepLines: true
  })
}

function optionParagraphs(question: Question): Paragraph[] {
  if (question.options.length === 0) return []
  const lines: Paragraph[] = []
  for (let index = 0; index < question.options.length; index += 2) {
    const current = question.options[index]
    const next = question.options[index + 1]
    const children = [
      textRun(`${current.key}. `, { bold: true }),
      ...inlineChildren(current.text)
    ]
    if (next) {
      children.push(textRun('        '), textRun(`${next.key}. `, { bold: true }), ...inlineChildren(next.text))
    }
    lines.push(
      new Paragraph({
        children,
        spacing: { after: 45, line: 315 },
        indent: { left: 360 },
        keepLines: true
      })
    )
  }
  return lines
}

function blankAnswerParagraphs(type: QuestionType, spaceScale = 1): Paragraph[] {
  const spacing = Math.round(answerSpacePoints(type) * spaceScale)
  if (spacing <= 0) return []
  return [
    new Paragraph({
      children: [textRun('')],
      spacing: { after: spacing }
    })
  ]
}

function sectionParagraphs(item: Extract<FlowItem, { kind: 'section' }>): Paragraph[] {
  return [
    new Paragraph({
      children: [
        textRun(item.title, { bold: true, size: 25 }),
        textRun(`（共 ${item.totalScore} 分）`, { size: 19 })
      ],
      spacing: { before: 150, after: 45 },
      border: {
        bottom: {
          color: '999999',
          space: 3,
          style: BorderStyle.SINGLE,
          size: 5
        }
      },
      keepNext: true
    }),
    new Paragraph({
      children: [textRun(item.instructions, { size: 18 })],
      spacing: { after: 90 },
      keepNext: true
    })
  ]
}

function defaultPageProperties() {
  return {
    page: {
      size: {
        width: 11906,
        height: 16838
      },
      margin: {
        top: 850,
        right: 960,
        bottom: 720,
        left: 960,
        header: 420,
        footer: 420
      }
    }
  }
}

function footer(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          textRun('零点出卷 · 第 ', { size: 16 }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: { name: FONT, eastAsia: FONT_EAST_ASIA },
            size: 16
          }),
          textRun(' 页 / 共 ', { size: 16 }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: { name: FONT, eastAsia: FONT_EAST_ASIA },
            size: 16
          }),
          textRun(' 页', { size: 16 })
        ]
      })
    ]
  })
}

async function flowPageChildren(
  pages: ReturnType<typeof paginatePaper>,
  spaceScale = 1
): Promise<Paragraph[]> {
  const children: Paragraph[] = []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pageIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    for (const item of pages[pageIndex].items) {
      if (item.kind === 'section') {
        children.push(...sectionParagraphs(item))
      } else if (item.kind === 'question') {
        children.push(questionParagraph(item))
        children.push(...optionParagraphs(item.question))
        const figure = await figureParagraph(item.question)
        if (figure) children.push(figure)
        children.push(...blankAnswerParagraphs(item.question.type, spaceScale))
      } else {
        children.push(
          new Paragraph({
            children: [textRun('')],
            spacing: { after: item.heightMm * 56.7 }
          })
        )
      }
    }
  }
  return children
}

function examHeader(paper: Paper): Paragraph[] {
  const grade = paper.config.grade === 7 ? '七年级' : paper.config.grade === 8 ? '八年级' : '九年级'
  const chapters = getSelectedChapters(paper.config.chapterIds)
    .map(chapterDisplayName)
    .join('；')
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [textRun(paper.config.title, { bold: true, size: 36 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        textRun(
          `${grade}数学 · ${paper.config.durationMinutes} 分钟 · 满分 ${paper.config.totalScore} 分`,
          { size: 19 }
        )
      ]
    }),
    new Paragraph({
      spacing: { after: 90 },
      children: [textRun('姓名：____________　班级：____________　学号：____________　得分：________')]
    }),
    new Paragraph({
      spacing: { after: 80 },
      border: {
        bottom: {
          color: '444444',
          space: 4,
          style: BorderStyle.SINGLE,
          size: 7
        }
      },
      children: [textRun(`考试范围：${chapters}`, { size: 17 })]
    }),
    new Paragraph({
      spacing: { before: 100, after: 100 },
      children: [textRun('说明：本试卷由 AI 辅助生成，使用前请教师审阅。', { size: 17 })]
    })
  ]
}

export async function exportPaperDocx(
  paper: Paper,
  outputPath: string,
  suppliedPages?: PageBlock[],
  spaceScale?: number
): Promise<void> {
  const pages = suppliedPages ?? paginatePaper(paper)
  const scale = spaceScale ?? answerSpaceFactor(paper)
  const children = [
    ...examHeader(paper),
    ...(await flowPageChildren(pages, scale))
  ]
  const document = new Document({
    creator: '零点出卷',
    title: paper.config.title,
    description: '零点出卷生成的初中数学试卷',
    styles: {
      default: {
        document: {
          run: {
            font: { name: FONT, eastAsia: FONT_EAST_ASIA, hAnsi: FONT },
            size: FONT_SIZE,
            language: { eastAsia: 'zh-CN' }
          },
          paragraph: {
            spacing: { line: 330 }
          }
        }
      }
    },
    sections: [
      {
        properties: defaultPageProperties(),
        footers: { default: footer() },
        children
      }
    ]
  })
  await fs.writeFile(outputPath, await Packer.toBuffer(document))
}

function answerHeader(paper: Paper): Paragraph[] {
  const grade = paper.config.grade === 7 ? '七年级' : paper.config.grade === 8 ? '八年级' : '九年级'
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [textRun(`${paper.config.title} · 答案与解析`, { bold: true, size: 34 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [textRun(`${grade}数学 · 满分 ${paper.config.totalScore} 分`, { size: 20 })]
    })
  ]
}

function answerParagraphs(sectionTitle: string, number: number, question: Question): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 100, after: 50 },
      children: [
        textRun(`${sectionTitle} ${number}. `, { bold: true }),
        ...inlineChildren(question.stem)
      ],
      keepLines: true
    }),
    new Paragraph({
      spacing: { after: 40 },
      indent: { left: 360 },
      children: [textRun('答案：', { bold: true }), ...inlineChildren(question.answer)]
    }),
    new Paragraph({
      spacing: { after: 140 },
      indent: { left: 360 },
      children: [textRun('解析：', { bold: true }), ...inlineChildren(question.explanation)]
    })
  ]
}

export async function exportAnswerDocx(paper: Paper, outputPath: string): Promise<void> {
  const children = answerHeader(paper)
  let number = 0
  for (const section of paper.sections) {
    for (const question of section.questions) {
      number += 1
      children.push(...answerParagraphs(section.title, number, question))
      const figure = await figureParagraph(question)
      if (figure) children.push(figure)
    }
  }
  const document = new Document({
    creator: '零点出卷',
    title: `${paper.config.title} 答案与解析`,
    styles: {
      default: {
        document: {
          run: {
            font: { name: FONT, eastAsia: FONT_EAST_ASIA, hAnsi: FONT },
            size: 20,
            language: { eastAsia: 'zh-CN' }
          },
          paragraph: { spacing: { line: 330 } }
        }
      }
    },
    sections: [
      {
        properties: defaultPageProperties(),
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [textRun('教师审阅版', { size: 16 })]
              })
            ]
          })
        },
        footers: { default: footer() },
        children
      }
    ]
  })
  await fs.writeFile(outputPath, await Packer.toBuffer(document))
}

