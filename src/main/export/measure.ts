import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { Paper } from '../../shared/schemas'
import {
  buildFlowItems,
  packWithSpaceFit,
  type PageBlock
} from '../../shared/pagination'
import { buildMeasurementHtml } from './html'
import { createTempDirectory } from './temp'

const BUFFER_PX = 12

export interface MeasuredLayout {
  pages: PageBlock[]
  spaceScale: number
  overflow: boolean
}

export async function measurePaperPages(paper: Paper): Promise<MeasuredLayout> {
  const html = await buildMeasurementHtml(paper)
  const tempDirectory = await createTempDirectory('lingdian-measure-')
  const htmlPath = path.join(tempDirectory, 'measure.html')
  await fs.writeFile(htmlPath, html, 'utf8')
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1400,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    await window.loadFile(htmlPath)
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    const heights = (await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('[data-measure-index]')).map((element) => {
        const style = getComputedStyle(element);
        const marginBottom = Number.parseFloat(style.marginBottom || '0');
        const space = element.querySelector('[data-answer-space]');
        return {
          total: element.getBoundingClientRect().height + marginBottom,
          space: space ? space.getBoundingClientRect().height : 0
        };
      })
    `)) as Array<{ total: number; space: number }>

    const flowItems = buildFlowItems(paper)
    const fixedHeights = heights.map((item) => Math.max(0, item.total - item.space))
    const spaceHeights = heights.map((item) => item.space)
    const fitted = packWithSpaceFit(
      flowItems,
      fixedHeights.map((height) => height + BUFFER_PX),
      spaceHeights,
      paper.config.pageCount
    )
    return {
      pages: fitted.pages,
      spaceScale: fitted.spaceScale,
      overflow: fitted.overflow
    }
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

