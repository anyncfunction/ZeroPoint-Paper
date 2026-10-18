import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { PDFDocument } from 'pdf-lib'
import type { Paper } from '../../shared/schemas'
import type { PageBlock } from '../../shared/pagination'
import { buildAnswerHtml, buildPaperHtml } from './html'

export async function renderHtmlToPdf(html: string, outputPath: string): Promise<number> {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingdian-pdf-'))
  const htmlPath = path.join(tempDirectory, 'document.html')
  await fs.writeFile(htmlPath, html, 'utf8')
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    await window.loadFile(htmlPath)
    await new Promise<void>((resolve) =>
      window.webContents.executeJavaScript('document.fonts.ready.then(() => true)').then(() => resolve())
    )
    const overflowingPages = (await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.page')).flatMap((page, index) => {
        const content = page.querySelector('.page-content');
        if (!content) return [];
        return content.scrollHeight > content.clientHeight + 2 ? [index + 1] : [];
      })
    `)) as number[]
    if (overflowingPages.length > 0) {
      throw new Error(
        `第 ${overflowingPages.join('、')} 页内容超出页面边界，请增加页数或减少题量后重试。`
      )
    }
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    })
    await fs.writeFile(outputPath, pdf)
    const parsed = await PDFDocument.load(pdf)
    return parsed.getPageCount()
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function exportPaperPdf(
  paper: Paper,
  outputPath: string,
  pages?: PageBlock[],
  spaceScale?: number
): Promise<void> {
  const html = await buildPaperHtml(paper, pages, spaceScale)
  const pageCount = await renderHtmlToPdf(html, outputPath)
  if (pageCount !== paper.config.pageCount) {
    throw new Error(
      `PDF 实际生成 ${pageCount} 页，与设定的 ${paper.config.pageCount} 页不一致。请减少题量或增加页数后重试。`
    )
  }
}

export async function exportAnswerPdf(paper: Paper, outputPath: string): Promise<void> {
  const html = await buildAnswerHtml(paper)
  await renderHtmlToPdf(html, outputPath)
}

