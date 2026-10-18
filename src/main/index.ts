import { promises as fs } from 'node:fs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } from 'electron'
import type {
  ExamConfig,
  ExportFormat,
  Paper,
  ProgressEvent,
  ProviderTestInput,
  TokenUsage
} from '../shared/schemas'
import {
  examConfigSchema,
  exportFormatSchema,
  paperSchema,
  providerSaveSchema,
  providerTestSchema,
  questionBankUpdateSchema
} from '../shared/schemas'
import { getChapters } from '../shared/curriculum'
import { PROVIDER_PRESETS } from '../shared/constants'
import { IPC } from '../shared/ipc'
import { AppStorage } from './services/storage'
import { createExamPlan } from './services/planner'
import {
  generatePaper,
  generateSingleQuestion,
  hardenExistingPaper,
  type GenerationCheckpoint
} from './services/generator'
import { testConnection } from './services/ai-client'
import { validatePaper } from './services/validation'
import { setFetchImplementation } from './services/http'
import { exportAnswerPdf, exportPaperPdf } from './export/pdf'
import { exportAnswerDocx, exportPaperDocx } from './export/docx'
import { setKatexRoot } from './export/html'
import { measurePaperPages } from './export/measure'
import { exportAnswerSheetPdf } from './export/answer-sheet'

let mainWindow: BrowserWindow | null = null
let storage: AppStorage
let activeGeneration: AbortController | null = null
const generationCheckpoints = new Map<string, GenerationCheckpoint>()
const bypassSingleInstance = process.env.LINGDIAN_E2E_MULTI === '1'
const hideWindowForTest = process.env.LINGDIAN_E2E_HIDDEN === '1'
const testDataDirectory = process.env.LINGDIAN_DATA_DIR

if (testDataDirectory) {
  app.setPath('userData', path.resolve(testDataDirectory))
}

function sendProgress(event: ProgressEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.paperProgress, event)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f3',
    title: '零点出卷',
    icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!hideWindowForTest) {
    mainWindow.once('ready-to-show', () => mainWindow?.show())
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return (cleaned || '未命名试卷').slice(0, 48)
}

function backupTitle(title: string): string {
  const suffix = '（再拔高前）'
  return `${title.slice(0, 60 - suffix.length)}${suffix}`
}

function timestampForFolder(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function ensureProvider(): Promise<{
  profile: Awaited<ReturnType<AppStorage['getProfile']>>
  apiKey: string
}> {
  const profile = await storage.getProfile()
  const apiKey = await storage.getApiKey()
  const localEndpoint = /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(
    profile.baseUrl
  )
  if (!apiKey && !localEndpoint) {
    throw new Error('请先在“AI 设置”中填写并保存 API Key')
  }
  return { profile, apiKey }
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 }
}

function addUsage(target: TokenUsage, next: TokenUsage): void {
  target.promptTokens += next.promptTokens
  target.completionTokens += next.completionTokens
  target.totalTokens += next.totalTokens
  target.requests += next.requests
}

function generationKey(config: ExamConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

async function assertBudget(profile: Awaited<ReturnType<AppStorage['getProfile']>>): Promise<void> {
  if (profile.monthlyTokenBudget <= 0) return
  const usage = await storage.getMonthlyUsage()
  if (usage.totalTokens >= profile.monthlyTokenBudget) {
    throw new Error(
      `本月 AI 用量已达到上限（${usage.totalTokens} / ${profile.monthlyTokenBudget} tokens）。可在 AI 设置中调整月度上限。`
    )
  }
}

async function recordUsage(
  usage: TokenUsage,
  profile: Awaited<ReturnType<AppStorage['getProfile']>>
): Promise<void> {
  if (usage.requests === 0) return
  await storage.addUsage(usage, profile)
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    dataDirectory: storage.dataDirectory,
    defaultOutputDirectory: storage.defaultOutputDirectory
  }))

  ipcMain.handle(IPC.settingsGet, async () => ({
    profile: await storage.getProfile(),
    presets: PROVIDER_PRESETS.map((preset) => ({ ...preset })),
    usage: await storage.getMonthlyUsage()
  }))

  ipcMain.handle(IPC.settingsSave, async (_event, input: unknown) => {
    const parsed = providerSaveSchema.parse(input)
    const profile = await storage.saveProfile(parsed)
    return {
      profile,
      presets: PROVIDER_PRESETS.map((preset) => ({ ...preset })),
      usage: await storage.getMonthlyUsage()
    }
  })

  ipcMain.handle(IPC.providerTest, async (_event, input: unknown) => {
    const parsed: ProviderTestInput = providerTestSchema.parse(input)
    const apiKey = parsed.apiKey?.trim() || (await storage.getApiKey())
    const primary = await testConnection(
      {
        ...parsed.profile,
        hasApiKey: Boolean(apiKey)
      },
      apiKey
    )
    const reviewModel = parsed.profile.reviewModel?.trim()
    if (!primary.ok || !reviewModel || reviewModel === parsed.profile.model) {
      return primary
    }
    const review = await testConnection(
      {
        ...parsed.profile,
        model: reviewModel,
        hasApiKey: Boolean(apiKey)
      },
      apiKey
    )
    return review.ok
      ? {
          ok: true,
          message: `主模型与复核模型均连接成功（${reviewModel}）`,
          latencyMs: (primary.latencyMs ?? 0) + (review.latencyMs ?? 0)
        }
      : {
          ok: false,
          message: `主模型正常，但复核模型 ${reviewModel} 失败：${review.message}`,
          latencyMs: (primary.latencyMs ?? 0) + (review.latencyMs ?? 0)
        }
  })

  ipcMain.handle(IPC.chaptersList, (_event, edition: ExamConfig['edition'], grade: ExamConfig['grade']) =>
    getChapters(edition, grade)
  )

  ipcMain.handle(IPC.paperPreflight, (_event, input: unknown) => {
    const config = examConfigSchema.parse(input)
    return createExamPlan(config)
  })

  ipcMain.handle(IPC.paperGenerate, async (_event, input: unknown): Promise<Paper> => {
    const config = examConfigSchema.parse(input)
    const { profile, apiKey } = await ensureProvider()
    await assertBudget(profile)
    if (activeGeneration) activeGeneration.abort()
    activeGeneration = new AbortController()
    const key = generationKey(config)
    const cached = generationCheckpoints.get(key)
    const checkpoint: GenerationCheckpoint = cached ?? {
      key,
      sections: await storage.loadCheckpoint(key)
    }
    let saveQueue = Promise.resolve()
    checkpoint.onSection = (index, section) => {
      saveQueue = saveQueue
        .then(() => storage.saveCheckpointSection(key, index, section))
        .catch(() => undefined)
    }
    generationCheckpoints.set(key, checkpoint)
    const usage = emptyUsage()
    try {
      const avoidStems = config.avoidCrossPaperDuplicates
        ? await storage.getExistingQuestionStems()
        : []
      const paper = await generatePaper(config, {
        profile,
        apiKey,
        avoidStems,
        signal: activeGeneration.signal,
        onProgress: sendProgress,
        onUsage: (next) => addUsage(usage, next),
        checkpoint
      })
      await storage.savePaper(paper)
      generationCheckpoints.delete(key)
      await saveQueue
      await storage.clearCheckpoint(key)
      await recordUsage(usage, profile)
      sendProgress({
        paperId: paper.id,
        stage: 'done',
        message: `试卷已生成并保存到本地试卷库，消耗约 ${usage.totalTokens} tokens`
      })
      return paper
    } catch (error) {
      await saveQueue
      await recordUsage(usage, profile)
      sendProgress({
        stage: 'error',
        message: `${(error as Error).message || '生成失败'}（已完成的题组会自动复用）`
      })
      throw error
    } finally {
      activeGeneration = null
    }
  })

  ipcMain.handle(IPC.paperCancel, () => {
    activeGeneration?.abort()
    activeGeneration = null
  })

  ipcMain.handle(IPC.paperSave, async (_event, input: unknown) => {
    const paper = validatePaper(paperSchema.parse(input))
    await storage.savePaper(paper)
  })

  ipcMain.handle(
    IPC.paperRegenerateQuestion,
    async (_event, input: { paper: unknown; sectionIndex: number; questionIndex: number }) => {
      const paper = validatePaper(paperSchema.parse(input.paper))
      const { profile, apiKey } = await ensureProvider()
      await assertBudget(profile)
      const controller = new AbortController()
      const usage = emptyUsage()
      const question = await generateSingleQuestion(
        paper,
        input.sectionIndex,
        input.questionIndex,
        profile,
        apiKey,
        controller.signal,
        new Set(),
        [],
        (next) => addUsage(usage, next)
      )
      await recordUsage(usage, profile)
      return question
    }
  )

  ipcMain.handle(
    IPC.paperHarden,
    async (
      _event,
      input: {
        paper: unknown
        sectionIndex?: number
        questionIndex?: number
      }
    ): Promise<Paper> => {
      const paper = validatePaper(paperSchema.parse(input.paper))
      const { profile, apiKey } = await ensureProvider()
      await assertBudget(profile)
      if (activeGeneration) activeGeneration.abort()
      activeGeneration = new AbortController()
      const usage = emptyUsage()
      const now = new Date().toISOString()
      const backup: Paper = {
        ...structuredClone(paper),
        id: randomUUID(),
        config: {
          ...paper.config,
          title: backupTitle(paper.config.title)
        },
        createdAt: now,
        updatedAt: now
      }
      await storage.savePaper(backup)
      try {
        const strengthened = await hardenExistingPaper(
          paper,
          {
            sectionIndex: input.sectionIndex,
            questionIndex: input.questionIndex
          },
          {
            profile,
            apiKey,
            avoidStems: paper.config.avoidCrossPaperDuplicates
              ? await storage.getExistingQuestionStems(paper.id)
              : [],
            signal: activeGeneration.signal,
            onProgress: sendProgress,
            onUsage: (next) => addUsage(usage, next)
          }
        )
        const previous = paper.usage
        strengthened.usage = {
          promptTokens: (previous?.promptTokens ?? 0) + usage.promptTokens,
          completionTokens: (previous?.completionTokens ?? 0) + usage.completionTokens,
          totalTokens: (previous?.totalTokens ?? 0) + usage.totalTokens,
          requests: (previous?.requests ?? 0) + usage.requests,
          estimatedCost:
            (previous?.estimatedCost ?? 0) +
            (usage.promptTokens / 1_000_000) * profile.inputPricePerM +
            (usage.completionTokens / 1_000_000) * profile.outputPricePerM
        }
        await storage.savePaper(strengthened)
        await recordUsage(usage, profile)
        sendProgress({
          paperId: strengthened.id,
          stage: 'done',
          message: '题目的难度与答案复核已完成'
        })
        return strengthened
      } catch (error) {
        await recordUsage(usage, profile)
        sendProgress({
          paperId: paper.id,
          stage: 'error',
          message: (error as Error).message || '再拔高失败'
        })
        throw error
      } finally {
        activeGeneration = null
      }
    }
  )

  ipcMain.handle(
    IPC.paperExport,
    async (
      _event,
      input: { paper: unknown; formats: string[]; includeAnswerSheet?: boolean }
    ): Promise<{ outputFolder: string; files: string[] }> => {
      const paper = validatePaper(paperSchema.parse(input.paper))
      const formats = input.formats.map((format) => exportFormatSchema.parse(format))
      if (formats.length === 0) throw new Error('请至少选择一种导出格式')
      await storage.savePaper(paper)
      const layout = await measurePaperPages(paper)
      const measuredPages = layout.pages
      if (layout.overflow) {
        throw new Error(
          `作答空间不足：当前题量在 ${paper.config.pageCount} 页内无法保留最小书写空间，请增加页数或减少题量。`
        )
      }
      if (measuredPages.length > paper.config.pageCount) {
        throw new Error(
          `实际排版需要 ${measuredPages.length} 页，超过设定的 ${paper.config.pageCount} 页。请先在预览中调整页数或减少题量。`
        )
      }

      const title = safeFileName(paper.config.title)
      const folder = path.join(
        storage.defaultOutputDirectory,
        `${title}_${timestampForFolder()}`
      )
      await fs.mkdir(folder, { recursive: true })
      const files: string[] = []
      const uniqueFormats = [...new Set(formats)] as ExportFormat[]
      sendProgress({ paperId: paper.id, stage: 'typesetting', message: '正在导出试卷文件' })
      for (const format of uniqueFormats) {
        if (format === 'pdf') {
          const paperFile = path.join(folder, `${title}_试卷.pdf`)
          const answerFile = path.join(folder, `${title}_答案与解析.pdf`)
          await exportPaperPdf(paper, paperFile, measuredPages, layout.spaceScale)
          await exportAnswerPdf(paper, answerFile)
          files.push(paperFile, answerFile)
        } else {
          const paperFile = path.join(folder, `${title}_试卷.docx`)
          const answerFile = path.join(folder, `${title}_答案与解析.docx`)
          await exportPaperDocx(paper, paperFile, measuredPages, layout.spaceScale)
          await exportAnswerDocx(paper, answerFile)
          files.push(paperFile, answerFile)
        }
      }
      if (input.includeAnswerSheet ?? paper.config.includeAnswerSheet) {
        const answerSheetFile = path.join(folder, `${title}_答题卡.pdf`)
        await exportAnswerSheetPdf(paper, answerSheetFile)
        files.push(answerSheetFile)
      }
      await storage.saveExportInfo(paper.id, folder, files)
      sendProgress({ paperId: paper.id, stage: 'done', message: '导出完成' })
      return { outputFolder: folder, files }
    }
  )

  ipcMain.handle(IPC.libraryList, () => storage.listPapers())
  ipcMain.handle(IPC.questionBankList, () => storage.listQuestionBank())
  ipcMain.handle(IPC.questionBankUpdate, (_event, input: unknown) =>
    storage.updateBankEntry(questionBankUpdateSchema.parse(input))
  )
  ipcMain.handle(IPC.questionBankExport, async () => {
    const options = {
      title: '导出本地题库',
      defaultPath: path.join(
        storage.defaultOutputDirectory,
        `零点题库_${timestampForFolder()}.json`
      ),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await storage.exportQuestionBank(result.filePath)
    return result.filePath
  })
  ipcMain.handle(IPC.libraryGet, (_event, id: string) => storage.getPaper(id))
  ipcMain.handle(IPC.libraryDelete, (_event, id: string) => storage.deletePaper(id))
  ipcMain.handle(IPC.libraryDeleteMany, (_event, ids: string[]) =>
    storage.deletePapers(ids)
  )
  ipcMain.handle(IPC.libraryDuplicate, (_event, id: string) =>
    storage.duplicatePaper(id)
  )
  ipcMain.handle(IPC.shellOpenPath, async (_event, targetPath: string) => {
    const resolved = path.resolve(targetPath)
    const root = path.resolve(storage.defaultOutputDirectory)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('只能打开由零点出卷创建的导出目录')
    }
    await shell.openPath(resolved)
  })
}

// 数据目录不可写时 Electron 会静默退出，用户只看到窗口闪一下。先自检并说明原因。
function userDataWritable(): boolean {
  const directory = app.getPath('userData')
  const probe = path.join(directory, `.write-probe-${process.pid}`)
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return true
  } catch {
    dialog.showErrorBox(
      '无法启动零点出卷',
      `数据目录不可写：${directory}\n\n请检查该文件夹权限，或用管理员身份启动一次后再试。`
    )
    return false
  }
}

const dataDirectoryReady = userDataWritable()
const singleInstance =
  dataDirectoryReady && (bypassSingleInstance || app.requestSingleInstanceLock())
if (!singleInstance) {
  if (dataDirectoryReady) app.quit()
  else app.exit(1)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('cn.lingdian.chujuan')
    setFetchImplementation((input, init) =>
      net.fetch(input instanceof Request ? input.url : input.toString(), init)
    )
    Menu.setApplicationMenu(null)
    storage = new AppStorage(
      app.getPath('userData'),
      process.env.LINGDIAN_DOCUMENTS_DIR ?? app.getPath('documents')
    )
    await storage.init()
    await storage.pruneCheckpoints()
    setKatexRoot(path.join(app.getAppPath(), 'node_modules', 'katex'))
    registerIpc()
    createWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

