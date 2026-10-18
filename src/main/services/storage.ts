import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import {
  libraryRecordSchema,
  paperSchema,
  paperSectionSchema,
  providerProfileSchema,
  type LibraryRecord,
  type Paper,
  type PaperSection,
  type PaperSummary,
  type ProviderProfile,
  type ProviderSaveInput,
  type QuestionBankEntry,
  type QuestionBankState,
  type QuestionBankUpdate,
  questionBankStateSchema,
  type TokenUsage,
  type UsageSummary,
  usageSummarySchema
} from '../../shared/schemas'
import { normalizeStem } from '../../shared/fingerprint'
import { getSelectedChapters } from '../../shared/curriculum'

const DEFAULT_PROFILE: ProviderProfile = {
  id: 'default',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  reviewModel: '',
  authMode: 'user-key',
  timeoutMs: 90_000,
  concurrency: 3,
  reasoningEffort: 'medium',
  answerReview: true,
  monthlyTokenBudget: 0,
  inputPricePerM: 0,
  outputPricePerM: 0
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error('无效的试卷编号')
  }
  return id
}

async function atomicWrite(filePath: string, contents: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, contents)
  await fs.rename(tempPath, filePath)
}

export class AppStorage {
  readonly dataDirectory: string
  readonly defaultOutputDirectory: string
  private readonly papersDirectory: string
  private readonly settingsFile: string
  private readonly keyFile: string
  private readonly usageFile: string
  private readonly checkpointsDirectory: string
  private readonly bankStateFile: string

  constructor(dataDirectory: string, documentsDirectory: string) {
    this.dataDirectory = dataDirectory
    this.defaultOutputDirectory = path.join(documentsDirectory, '零点出卷', '导出')
    this.papersDirectory = path.join(dataDirectory, 'papers')
    this.settingsFile = path.join(dataDirectory, 'settings.json')
    this.keyFile = path.join(dataDirectory, 'provider-key.bin')
    this.usageFile = path.join(dataDirectory, 'usage.json')
    this.checkpointsDirectory = path.join(dataDirectory, 'checkpoints')
    this.bankStateFile = path.join(dataDirectory, 'question-bank.json')
  }

  async init(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.papersDirectory, { recursive: true }),
      fs.mkdir(this.defaultOutputDirectory, { recursive: true }),
      fs.mkdir(this.checkpointsDirectory, { recursive: true })
    ])
  }

  async getProfile(): Promise<ProviderProfile> {
    let stored: Partial<ProviderProfile> = {}
    try {
      stored = JSON.parse(await fs.readFile(this.settingsFile, 'utf8')) as ProviderProfile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const profile = providerProfileSchema.parse({
      ...DEFAULT_PROFILE,
      ...stored,
      id: stored.id ?? DEFAULT_PROFILE.id
    })
    return {
      ...profile,
      hasApiKey: await this.hasApiKey()
    }
  }

  async saveProfile(input: ProviderSaveInput): Promise<ProviderProfile> {
    const profile = providerProfileSchema.parse({
      ...input.profile,
      hasApiKey: undefined
    })
    await atomicWrite(
      this.settingsFile,
      JSON.stringify({ ...profile, hasApiKey: undefined }, null, 2)
    )
    if (input.apiKey?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('当前系统无法使用安全存储，暂时不能保存 API Key')
      }
      const encrypted = safeStorage.encryptString(input.apiKey.trim())
      await atomicWrite(this.keyFile, encrypted)
    }
    return this.getProfile()
  }

  async hasApiKey(): Promise<boolean> {
    try {
      await fs.access(this.keyFile)
      return true
    } catch {
      return false
    }
  }

  async getApiKey(): Promise<string> {
    try {
      const encrypted = await fs.readFile(this.keyFile)
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('当前系统无法读取安全存储中的 API Key')
      }
      return safeStorage.decryptString(encrypted)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
  }

  private recordPath(id: string): string {
    return path.join(this.papersDirectory, `paper-${safeId(id)}.json`)
  }

  async savePaper(paper: Paper): Promise<void> {
    const validated = paperSchema.parse(paper)
    let existing: LibraryRecord | null = null
    try {
      existing = await this.getRecord(validated.id)
    } catch {
      existing = null
    }
    const record: LibraryRecord = {
      paper: validated,
      outputFolder: existing?.outputFolder,
      exportedFiles: existing?.exportedFiles ?? []
    }
    await atomicWrite(this.recordPath(validated.id), JSON.stringify(record, null, 2))
  }

  async saveExportInfo(
    paperId: string,
    outputFolder: string,
    exportedFiles: string[]
  ): Promise<void> {
    const record = await this.getRecord(paperId)
    if (!record) throw new Error('试卷尚未保存')
    await atomicWrite(
      this.recordPath(paperId),
      JSON.stringify({ ...record, outputFolder, exportedFiles }, null, 2)
    )
  }

  async getRecord(id: string): Promise<LibraryRecord | null> {
    try {
      const content = await fs.readFile(this.recordPath(id), 'utf8')
      return libraryRecordSchema.parse(JSON.parse(content))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async getPaper(id: string): Promise<Paper | null> {
    const record = await this.getRecord(id)
    return record?.paper ?? null
  }

  async listPapers(): Promise<PaperSummary[]> {
    const entries = await fs.readdir(this.papersDirectory, { withFileTypes: true })
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^paper-.+\.json$/.test(entry.name))
        .map(async (entry) => {
          try {
            const content = await fs.readFile(
              path.join(this.papersDirectory, entry.name),
              'utf8'
            )
            return libraryRecordSchema.parse(JSON.parse(content))
          } catch {
            return null
          }
        })
    )

    return records
      .filter((record): record is LibraryRecord => Boolean(record))
      .map((record) => ({
        id: record.paper.id,
        title: record.paper.config.title,
        grade: record.paper.config.grade,
        edition: record.paper.config.edition,
        pageCount: record.paper.config.pageCount,
        difficulty: record.paper.config.difficulty,
        questionCount: record.paper.plan.totalQuestions,
        totalTokens: record.paper.usage?.totalTokens,
        estimatedCost: record.paper.usage?.estimatedCost,
        createdAt: record.paper.createdAt,
        updatedAt: record.paper.updatedAt,
        outputFolder: record.outputFolder
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async listQuestionBank(): Promise<QuestionBankEntry[]> {
    const state = await this.getBankState()
    const favorites = new Set(state.favorites)
    const excluded = new Set(state.excluded)
    const entries = await fs.readdir(this.papersDirectory, { withFileTypes: true })
    const records: LibraryRecord[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !/^paper-.+\.json$/.test(entry.name)) continue
      try {
        const content = await fs.readFile(
          path.join(this.papersDirectory, entry.name),
          'utf8'
        )
        records.push(libraryRecordSchema.parse(JSON.parse(content)))
      } catch {
        // Ignore a damaged paper instead of blocking the whole bank.
      }
    }
    records.sort((a, b) => b.paper.updatedAt.localeCompare(a.paper.updatedAt))

    const bank = new Map<string, QuestionBankEntry>()
    for (const record of records) {
      for (const section of record.paper.sections) {
        for (const question of section.questions) {
          const fingerprint = normalizeStem(question.stem)
          const existing = bank.get(fingerprint)
          if (existing) {
            existing.occurrences += 1
            continue
          }
          const chapter = getSelectedChapters([question.chapterId])[0]
          bank.set(fingerprint, {
            id: createHash('sha256').update(fingerprint).digest('hex').slice(0, 20),
            paperId: record.paper.id,
            paperTitle: record.paper.config.title,
            question,
            grade: record.paper.config.grade,
            edition: record.paper.config.edition,
            chapterTitle: chapter?.title ?? question.chapterId,
            createdAt: record.paper.createdAt,
            occurrences: 1,
            favorite: favorites.has(
              createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)
            ),
            excluded: excluded.has(
              createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)
            )
          })
        }
      }
    }
    return [...bank.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getExistingQuestionStems(excludePaperId?: string): Promise<string[]> {
    const state = await this.getBankState()
    const excluded = new Set(state.excluded)
    const entries = await fs.readdir(this.papersDirectory, { withFileTypes: true })
    const stems = new Set<string>()
    for (const entry of entries) {
      if (!entry.isFile() || !/^paper-.+\.json$/.test(entry.name)) continue
      try {
        const content = await fs.readFile(
          path.join(this.papersDirectory, entry.name),
          'utf8'
        )
        const record = libraryRecordSchema.parse(JSON.parse(content))
        if (record.paper.id === excludePaperId) continue
        for (const section of record.paper.sections) {
          for (const question of section.questions) {
            const fingerprint = normalizeStem(question.stem)
            const id = createHash('sha256')
              .update(fingerprint)
              .digest('hex')
              .slice(0, 20)
            if (excluded.has(id)) continue
            stems.add(question.stem)
          }
        }
      } catch {
        // Ignore damaged records.
      }
    }
    return [...stems]
  }

  async deletePaper(id: string): Promise<void> {
    try {
      await fs.unlink(this.recordPath(id))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async deletePapers(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.deletePaper(id)))
  }

  async duplicatePaper(id: string): Promise<Paper> {
    const record = await this.getRecord(id)
    if (!record) throw new Error('找不到要复制的试卷')
    const now = new Date().toISOString()
    const suffix = '（副本）'
    const copy: Paper = {
      ...structuredClone(record.paper),
      id: randomUUID(),
      config: {
        ...record.paper.config,
        title: `${record.paper.config.title.slice(0, 60 - suffix.length)}${suffix}`
      },
      createdAt: now,
      updatedAt: now
    }
    await this.savePaper(copy)
    return copy
  }

  async getMonthlyUsage(): Promise<UsageSummary> {
    return this.readUsage()
  }

  async getBankState(): Promise<QuestionBankState> {
    try {
      return questionBankStateSchema.parse(
        JSON.parse(await fs.readFile(this.bankStateFile, 'utf8'))
      )
    } catch {
      return { favorites: [], excluded: [] }
    }
  }

  async updateBankEntry(update: QuestionBankUpdate): Promise<QuestionBankState> {
    const state = await this.getBankState()
    const favorites = new Set(state.favorites)
    const excluded = new Set(state.excluded)
    if (update.favorite !== undefined) {
      if (update.favorite) favorites.add(update.id)
      else favorites.delete(update.id)
    }
    if (update.excluded !== undefined) {
      if (update.excluded) excluded.add(update.id)
      else excluded.delete(update.id)
    }
    const next: QuestionBankState = {
      favorites: [...favorites],
      excluded: [...excluded]
    }
    await atomicWrite(this.bankStateFile, JSON.stringify(next, null, 2))
    return next
  }

  async exportQuestionBank(targetPath: string): Promise<void> {
    const entries = await this.listQuestionBank()
    const payload = {
      exportedAt: new Date().toISOString(),
      app: '零点出卷',
      version: 1,
      entries
    }
    await atomicWrite(targetPath, JSON.stringify(payload, null, 2))
  }

  private async readUsage(): Promise<UsageSummary> {
    const month = new Date().toISOString().slice(0, 7)
    try {
      const stored = usageSummarySchema.parse(
        JSON.parse(await fs.readFile(this.usageFile, 'utf8'))
      )
      return stored.month === month
        ? stored
        : { month, promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, estimatedCost: 0, budget: 0 }
    } catch {
      return { month, promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, estimatedCost: 0, budget: 0 }
    }
  }

  async addUsage(
    usage: TokenUsage,
    profile: Pick<ProviderProfile, 'inputPricePerM' | 'outputPricePerM' | 'monthlyTokenBudget'>
  ): Promise<UsageSummary> {
    const current = await this.getMonthlyUsage()
    const next: UsageSummary = {
      month: current.month,
      promptTokens: current.promptTokens + usage.promptTokens,
      completionTokens: current.completionTokens + usage.completionTokens,
      totalTokens: current.totalTokens + usage.totalTokens,
      requests: current.requests + usage.requests,
      estimatedCost:
        current.estimatedCost +
        (usage.promptTokens / 1_000_000) * profile.inputPricePerM +
        (usage.completionTokens / 1_000_000) * profile.outputPricePerM,
      budget: profile.monthlyTokenBudget
    }
    await atomicWrite(this.usageFile, JSON.stringify(next, null, 2))
    return next
  }

  private checkpointPath(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('无效的断点编号')
    return path.join(this.checkpointsDirectory, `${key}.json`)
  }

  async loadCheckpoint(key: string): Promise<Map<number, PaperSection>> {
    const sections = new Map<number, PaperSection>()
    try {
      const raw = JSON.parse(
        await fs.readFile(this.checkpointPath(key), 'utf8')
      ) as { createdAt?: string; sections?: Array<{ index: number; section: unknown }> }
      const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : 0
      if (!createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
        await this.clearCheckpoint(key)
        return sections
      }
      for (const item of raw.sections ?? []) {
        const parsed = paperSectionSchema.safeParse(item.section)
        if (parsed.success && Number.isInteger(item.index)) {
          sections.set(item.index, parsed.data)
        }
      }
    } catch {
      return sections
    }
    return sections
  }

  async saveCheckpointSection(
    key: string,
    index: number,
    section: PaperSection
  ): Promise<void> {
    const existing = await this.loadCheckpoint(key)
    existing.set(index, section)
    const payload = {
      createdAt: new Date().toISOString(),
      sections: [...existing.entries()].map(([sectionIndex, value]) => ({
        index: sectionIndex,
        section: value
      }))
    }
    await atomicWrite(this.checkpointPath(key), JSON.stringify(payload, null, 2))
  }

  async clearCheckpoint(key: string): Promise<void> {
    try {
      await fs.unlink(this.checkpointPath(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async pruneCheckpoints(): Promise<void> {
    try {
      const entries = await fs.readdir(this.checkpointsDirectory, {
        withFileTypes: true
      })
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const full = path.join(this.checkpointsDirectory, entry.name)
            const stat = await fs.stat(full)
            if (stat.mtimeMs < cutoff) await fs.unlink(full).catch(() => undefined)
          })
      )
    } catch {
      // Checkpoint pruning is best effort.
    }
  }
}

