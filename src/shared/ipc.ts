import type {
  AppInfo,
  Chapter,
  ConnectionResult,
  ExamConfig,
  ExamPlan,
  ExportFormat,
  ExportResult,
  Paper,
  PaperSummary,
  ProgressEvent,
  ProviderProfile,
  ProviderSaveInput,
  ProviderTestInput,
  QuestionBankEntry,
  QuestionBankState,
  QuestionBankUpdate,
  Question,
  SettingsSnapshot
} from './schemas'

export interface ChujuanApi {
  getAppInfo(): Promise<AppInfo>
  getSettings(): Promise<SettingsSnapshot>
  saveSettings(input: ProviderSaveInput): Promise<SettingsSnapshot>
  testProvider(input: ProviderTestInput): Promise<ConnectionResult>
  listChapters(edition: ExamConfig['edition'], grade: ExamConfig['grade']): Promise<Chapter[]>
  preflight(config: ExamConfig): Promise<ExamPlan>
  generatePaper(config: ExamConfig): Promise<Paper>
  cancelGeneration(): Promise<void>
  onProgress(callback: (event: ProgressEvent) => void): () => void
  savePaper(paper: Paper): Promise<void>
  regenerateQuestion(
    paper: Paper,
    sectionIndex: number,
    questionIndex: number
  ): Promise<Question>
  hardenPaper(
    paper: Paper,
    sectionIndex?: number,
    questionIndex?: number
  ): Promise<Paper>
  exportPaper(
    paper: Paper,
    formats: ExportFormat[],
    includeAnswerSheet?: boolean
  ): Promise<ExportResult>
  listPapers(): Promise<PaperSummary[]>
  listQuestionBank(): Promise<QuestionBankEntry[]>
  updateQuestionBank(update: QuestionBankUpdate): Promise<QuestionBankState>
  exportQuestionBank(): Promise<string | null>
  getPaper(id: string): Promise<Paper | null>
  deletePaper(id: string): Promise<void>
  deletePapers(ids: string[]): Promise<void>
  duplicatePaper(id: string): Promise<Paper>
  openOutputFolder(path: string): Promise<void>
}

export const IPC = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  providerTest: 'settings:test',
  chaptersList: 'chapters:list',
  paperPreflight: 'paper:preflight',
  paperGenerate: 'paper:generate',
  paperCancel: 'paper:cancel',
  paperProgress: 'paper:progress',
  paperSave: 'paper:save',
  paperRegenerateQuestion: 'paper:regenerate-question',
  paperHarden: 'paper:harden',
  paperExport: 'paper:export',
  libraryList: 'library:list',
  questionBankList: 'question-bank:list',
  questionBankUpdate: 'question-bank:update',
  questionBankExport: 'question-bank:export',
  libraryGet: 'library:get',
  libraryDelete: 'library:delete',
  libraryDeleteMany: 'library:delete-many',
  libraryDuplicate: 'library:duplicate',
  shellOpenPath: 'shell:open-path'
} as const

export type ProviderProfileInput = Omit<ProviderProfile, 'hasApiKey'>
