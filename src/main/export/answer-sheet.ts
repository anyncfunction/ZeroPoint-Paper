import type { Paper, QuestionType } from '../../shared/schemas'
import { GRADE_LABELS } from '../../shared/schemas'
import { escapeHtml } from '../../shared/rich-text'
import { renderHtmlToPdf } from './pdf'

const OPTION_KEYS = ['A', 'B', 'C', 'D']
const PAGE_CONTENT_MM = 268
const FIRST_PAGE_HEADER_MM = 44
const SECTION_HEAD_MM = 13
const CHOICE_ROW_MM = 8.5
const WRITE_GAP_MM = 3

type Row =
  | { kind: 'section'; title: string }
  | { kind: 'choice'; number: number }
  | { kind: 'write'; number: number; height: number }

function answerSpaceMm(type: QuestionType): number {
  switch (type) {
    case 'single_choice':
      return 0
    case 'fill_blank':
      return 16
    case 'calculation':
      return 38
    case 'solution':
      return 52
    case 'proof':
      return 58
    case 'application':
      return 50
  }
}

function rowHeight(row: Row): number {
  if (row.kind === 'section') return SECTION_HEAD_MM
  if (row.kind === 'choice') return CHOICE_ROW_MM
  return row.height + WRITE_GAP_MM
}

function packRows(rows: Row[]): Row[][] {
  const pages: Row[][] = []
  let page: Row[] = []
  let used = 0
  let capacity = PAGE_CONTENT_MM - FIRST_PAGE_HEADER_MM
  for (const row of rows) {
    const height = rowHeight(row)
    if (used + height > capacity && page.length > 0) {
      pages.push(page)
      page = []
      used = 0
      capacity = PAGE_CONTENT_MM
    }
    page.push(row)
    used += height
  }
  if (page.length > 0) pages.push(page)
  return pages.length > 0 ? pages : [[]]
}

function rowHtml(row: Row): string {
  if (row.kind === 'section') {
    return `<h2 class="sheet-section">${escapeHtml(row.title)}</h2>`
  }
  if (row.kind === 'choice') {
    const cells = OPTION_KEYS.map(
      (key) => `<span class="bubble">${key}</span>`
    ).join('')
    return `<div class="choice-row"><span class="q-no">${row.number}</span><div class="bubbles">${cells}</div></div>`
  }
  return `<div class="write-row"><span class="q-no">${row.number}</span><div class="write-box" style="height:${row.height}mm"></div></div>`
}

function buildHtml(paper: Paper): string {
  let number = 0
  const rows: Row[] = []
  for (const section of paper.sections) {
    rows.push({ kind: 'section', title: section.title })
    for (const _question of section.questions) {
      number += 1
      rows.push(
        section.type === 'single_choice'
          ? { kind: 'choice', number }
          : { kind: 'write', number, height: answerSpaceMm(section.type) }
      )
    }
  }

  const pages = packRows(rows)
  const pageHtml = pages
    .map(
      (items, pageIndex) => `<section class="page">
  <div class="page-inner">
    <div class="page-content">
      ${
        pageIndex === 0
          ? `<header class="sheet-head">
        <div class="sheet-title">${escapeHtml(paper.config.title)} · 答题卡</div>
        <div class="sheet-sub">${GRADE_LABELS[paper.config.grade]}数学 · ${paper.config.durationMinutes} 分钟 · 满分 ${paper.config.totalScore} 分</div>
        <div class="identity"><span>姓名：</span><span>班级：</span><span>学号：</span><span>得分：</span></div>
        <div class="notice">选择题请涂满对应选项；非选择题请在框内作答，超出边框的部分无效。</div>
      </header>`
          : ''
      }
      ${items.map(rowHtml).join('')}
    </div>
    <footer class="sheet-footer"><span>零点出卷 · 答题卡</span><span>第 ${pageIndex + 1} 页 / 共 ${pages.length} 页</span></footer>
  </div>
</section>`
    )
    .join('')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(paper.config.title)} 答题卡</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "SimSun", serif; }
  .page { width: 210mm; height: 297mm; padding: 14mm 16mm 12mm; overflow: hidden; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page-inner { height: 100%; display: flex; flex-direction: column; }
  .page-content { flex: 1; min-height: 0; }
  .sheet-head { border-bottom: 1.5px solid #111; padding-bottom: 4mm; margin-bottom: 5mm; }
  .sheet-title { text-align: center; font-size: 17pt; font-weight: 700; }
  .sheet-sub { text-align: center; font-size: 10pt; margin-top: 2mm; color: #333; }
  .identity { display: flex; gap: 6mm; margin-top: 5mm; font-size: 10pt; }
  .identity span { flex: 1; border-bottom: 1px solid #222; padding-bottom: 1mm; }
  .notice { font-size: 9pt; color: #333; margin-top: 3mm; }
  .sheet-section { font-size: 11.5pt; margin: 4mm 0 2.5mm; border-left: 3px solid #111; padding-left: 2.5mm; break-after: avoid; }
  .choice-row { display: flex; align-items: center; gap: 4mm; height: 8.5mm; }
  .q-no { width: 9mm; text-align: right; font-size: 10pt; }
  .bubbles { display: flex; gap: 5mm; }
  .bubble { display: inline-flex; align-items: center; justify-content: center; width: 7mm; height: 7mm; border: 1px solid #444; border-radius: 50%; font-size: 9pt; }
  .write-row { display: flex; gap: 4mm; margin-bottom: 3mm; }
  .write-box { flex: 1; border: 1px solid #999; border-radius: 1mm; }
  .sheet-footer { height: 6mm; border-top: 1px solid #bbb; padding-top: 1.5mm; font-size: 8.5pt; color: #555; display: flex; justify-content: space-between; align-items: flex-end; }
</style></head><body>${pageHtml}</body></html>`
}

export async function exportAnswerSheetPdf(
  paper: Paper,
  outputPath: string
): Promise<void> {
  await renderHtmlToPdf(buildHtml(paper), outputPath)
}

export function answerSheetPageCount(paper: Paper): number {
  const rows: Row[] = []
  for (const section of paper.sections) {
    rows.push({ kind: 'section', title: section.title })
    for (const _question of section.questions) {
      rows.push(
        section.type === 'single_choice'
          ? { kind: 'choice', number: 0 }
          : { kind: 'write', number: 0, height: answerSpaceMm(section.type) }
      )
    }
  }
  return packRows(rows).length
}
