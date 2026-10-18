import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Paper, Question } from '../../shared/schemas'
import { chapterDisplayName, getSelectedChapters } from '../../shared/curriculum'
import { renderFigureSvg } from '../../shared/figures'
import {
  answerSpaceFactor,
  answerSpaceMm,
  buildFlowItems,
  paginatePaper,
  type FlowItem,
  type PageBlock
} from '../../shared/pagination'
import { escapeHtml, renderMathHtml } from '../../shared/rich-text'

let katexCssPromise: Promise<string> | null = null
let katexRoot: string | null = null

export function setKatexRoot(root: string): void {
  katexRoot = root
  katexCssPromise = null
}

function richText(text: string, className = ''): string {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs
    .map((paragraph) => `<div class="${className}">${renderMathHtml(paragraph)}</div>`)
    .join('')
}

function questionHtml(
  item: Extract<FlowItem, { kind: 'question' }>,
  spaceScale = 1
): string {
  const question = item.question
  const options = question.options
    .map(
      (option) =>
        `<div class="option"><span class="option-key">${escapeHtml(option.key)}.</span>${renderMathHtml(option.text)}</div>`
    )
    .join('')
  return `<div class="question" data-question-id="${escapeHtml(question.id)}">
    <div class="question-line">
      <span class="question-number">${item.number}.</span>
      <div class="question-main">
        <div class="stem">${renderMathHtml(question.stem)}</div>
        ${options ? `<div class="options">${options}</div>` : ''}
        ${question.figure ? `<div class="figure">${renderFigureSvg(question.figure)}</div>` : ''}
        <div class="answer-space" data-answer-space style="height:${(
          answerSpaceMm(question.type) * spaceScale
        ).toFixed(2)}mm"></div>
        <div class="score">（${question.score} 分）</div>
      </div>
    </div>
  </div>`
}

function sectionHtml(item: Extract<FlowItem, { kind: 'section' }>): string {
  return `<div class="section-head">
    <h2>${escapeHtml(item.title)}</h2>
    <div class="section-meta">（共 ${item.totalScore} 分）</div>
    <div class="section-instructions">${escapeHtml(item.instructions)}</div>
  </div>`
}

function pageItems(items: FlowItem[], spaceScale = 1): string {
  return items
    .map((item) => {
      if (item.kind === 'section') return sectionHtml(item)
      if (item.kind === 'question') return questionHtml(item, spaceScale)
      return `<div class="spacer" style="height:${item.heightMm}mm"></div>`
    })
    .join('')
}

async function loadKatexCss(): Promise<string> {
  if (katexCssPromise) return katexCssPromise
  katexCssPromise = (async () => {
    if (!katexRoot) return ''
    const dist = path.join(katexRoot, 'dist')
    const css = await fs.readFile(path.join(dist, 'katex.min.css'), 'utf8')
    let output = css
    const fontPattern = /url\(fonts\/([^)]+)\)/g
    const matches = [...css.matchAll(fontPattern)]
    for (const match of matches) {
      const fileName = match[1]
      const extension = path.extname(fileName).slice(1)
      const mime =
        extension === 'woff2'
          ? 'font/woff2'
          : extension === 'woff'
            ? 'font/woff'
            : 'font/ttf'
      try {
        const data = await fs.readFile(path.join(dist, 'fonts', fileName))
        output = output.replace(
          match[0],
          `url(data:${mime};base64,${data.toString('base64')})`
        )
      } catch {
        // Keep the original URL when an optional format is absent.
      }
    }
    return output
  })()
  return katexCssPromise
}

function baseCss(): string {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #d7dad6; color: #111; }
  body { font-family: "SimSun", "Noto Serif CJK SC", serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; background: #fff; margin: 0 auto; position: relative; overflow: hidden; page-break-after: always; padding: 15mm 17mm 13mm; }
  .page:last-child { page-break-after: auto; }
  .page-inner { height: 100%; display: flex; flex-direction: column; position: relative; }
  .page-content { flex: 1; min-height: 0; }
  .exam-head { border-bottom: 1.5px solid #111; padding-bottom: 6mm; margin-bottom: 6mm; }
  .exam-title { text-align: center; font-size: 18pt; font-weight: 700; letter-spacing: 0; line-height: 1.35; }
  .exam-subtitle { text-align: center; font-size: 10.5pt; margin-top: 2.5mm; color: #333; }
  .identity-row { display: flex; justify-content: space-between; gap: 8mm; margin-top: 6mm; font-size: 10pt; }
  .identity-row span { flex: 1; border-bottom: 1px solid #222; padding-bottom: 1mm; }
  .notice { font-size: 9pt; line-height: 1.65; margin: 4mm 0 1mm; color: #222; }
  .section-head { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; column-gap: 4mm; border-bottom: 1px solid #bbb; padding: 1mm 0 2.5mm; margin: 1mm 0 4mm; break-inside: avoid; }
  .section-head h2 { font-size: 12.5pt; margin: 0; }
  .section-meta { font-size: 9.5pt; color: #444; }
  .section-instructions { font-size: 9pt; color: #555; }
  .question { break-inside: avoid; margin-bottom: 5mm; font-size: 10.5pt; line-height: 1.72; }
  .question-line { display: flex; gap: 2.5mm; }
  .question-number { width: 7mm; flex: 0 0 7mm; text-align: right; font-weight: 600; }
  .question-main { flex: 1; min-width: 0; }
  .stem { text-align: justify; text-wrap: pretty; hanging-punctuation: allow-end; line-break: strict; }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 8mm; margin: 2mm 0 0 1mm; }
  .option { display: flex; gap: 1.5mm; align-items: flex-start; }
  .option-key { flex: 0 0 auto; }
  .figure { display: flex; justify-content: center; margin: 2.5mm auto 1mm; width: 100%; }
  .math-figure { width: 72mm; height: auto; max-height: 43mm; }
  .score { text-align: right; font-size: 9pt; color: #444; margin-top: 1mm; }
  .page-footer { height: 6mm; border-top: 1px solid #bbb; display: flex; justify-content: space-between; align-items: flex-end; font-size: 8.5pt; color: #555; padding-top: 1.5mm; }
  .page-footer .center { position: absolute; left: 50%; transform: translateX(-50%); }
  .answer-page .exam-title { font-size: 17pt; }
  .answer-item { break-inside: avoid; margin-bottom: 5mm; font-size: 10pt; line-height: 1.7; }
  .answer-item h3 { font-size: 10.5pt; margin: 0 0 1mm; }
  .answer-label { font-weight: 700; }
  .answer-explanation { margin-top: 1.5mm; color: #222; }
  .spacer { display: block; }
  .katex { font-size: 1.03em; }
  `
}

function footer(page: number, total: number): string {
  return `<footer class="page-footer"><span>零点出卷 · AI 辅助命题</span><span class="center">第 ${page} 页 / 共 ${total} 页</span><span>请认真审题</span></footer>`
}

export async function buildPaperHtml(
  paper: Paper,
  suppliedPages?: PageBlock[],
  spaceScale?: number
): Promise<string> {
  const pages = suppliedPages ?? paginatePaper(paper)
  const scale = spaceScale ?? answerSpaceFactor(paper)
  const chapterNames = getSelectedChapters(paper.config.chapterIds)
    .map(chapterDisplayName)
    .join('；')
  const katexCss = await loadKatexCss()
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(paper.config.title)}</title>
<style>${katexCss}${baseCss()}</style></head>
<body>${pages
    .map(
      (page, index) => `<section class="page">
  <div class="page-inner">
    <div class="page-content">
      ${
        index === 0
          ? `<header class="exam-head">
        <div class="exam-title">${escapeHtml(paper.config.title)}</div>
        <div class="exam-subtitle">${paper.config.grade === 7 ? '七年级' : paper.config.grade === 8 ? '八年级' : '九年级'}数学 · ${paper.config.durationMinutes} 分钟 · 满分 ${paper.config.totalScore} 分</div>
        <div class="identity-row"><span>姓名：</span><span>班级：</span><span>学号：</span><span>得分：</span></div>
        <div class="notice">考试范围：${escapeHtml(chapterNames)}</div>
      </header>`
          : ''
      }
      ${pageItems(page.items, scale)}
    </div>
    ${footer(index + 1, pages.length)}
  </div>
</section>`
    )
    .join('')}</body></html>`
}

export async function buildMeasurementHtml(paper: Paper): Promise<string> {
  const items = buildFlowItems(paper)
  const katexCss = await loadKatexCss()
  const scale = answerSpaceFactor(paper)
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>layout-measure</title>
<style>${katexCss}${baseCss()}
  html, body { background: #fff; }
  .measure-sheet { width: 176mm; margin: 0; padding: 0; background: #fff; }
  .measure-item { display: flow-root; width: 100%; }
</style></head><body><div class="measure-sheet">${items
    .map((item, index) => {
      const content =
        item.kind === 'section'
          ? sectionHtml(item)
          : item.kind === 'question'
            ? questionHtml(item, scale)
            : ''
      return `<div class="measure-item" data-measure-index="${index}">${content}</div>`
    })
    .join('')}</div></body></html>`
}

function answerQuestion(
  sectionTitle: string,
  number: number,
  question: Question
): string {
  return `<div class="answer-item">
    <h3>${escapeHtml(sectionTitle)} ${number}. ${renderMathHtml(question.stem)}</h3>
    <div><span class="answer-label">答案：</span>${renderMathHtml(question.answer)}</div>
    <div class="answer-explanation"><span class="answer-label">解析：</span>${richText(question.explanation)}</div>
  </div>`
}

export async function buildAnswerHtml(paper: Paper): Promise<string> {
  const katexCss = await loadKatexCss()
  let number = 0
  const items = paper.sections
    .map((section) =>
      section.questions
        .map((question) => {
          number += 1
          return answerQuestion(section.title, number, question)
        })
        .join('')
    )
    .join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(
    paper.config.title
  )} 答案与解析</title><style>${katexCss}${baseCss()}
  .page { overflow: visible; height: auto; min-height: 297mm; }
  .page-inner { min-height: 273mm; }
  </style></head><body><section class="page answer-page"><div class="page-inner">
  <header class="exam-head"><div class="exam-title">${escapeHtml(
    paper.config.title
  )} · 答案与解析</div><div class="exam-subtitle">${paper.config.grade === 7 ? '七年级' : paper.config.grade === 8 ? '八年级' : '九年级'}数学 · 满分 ${paper.config.totalScore} 分</div></header>
  ${items}
  <footer class="page-footer"><span>零点出卷</span><span>教师审阅版</span></footer>
  </div></section></body></html>`
}

