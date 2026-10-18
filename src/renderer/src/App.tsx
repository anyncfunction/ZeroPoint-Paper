import { useCallback, useEffect, useState } from 'react'
import { BookOpen, FilePlus2, Files, LibraryBig, Settings2 } from 'lucide-react'
import type {
  AppInfo,
  ExamConfig,
  Paper,
  SettingsSnapshot
} from '../../shared/schemas'
import { examConfigSchema } from '../../shared/schemas'
import { getChapters } from '../../shared/curriculum'
import { WizardScreen } from './screens/WizardScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { CatalogScreen } from './screens/CatalogScreen'
import { QuestionBankScreen } from './screens/QuestionBankScreen'
import { PreviewScreen } from './screens/PreviewScreen'
import { defaultTitle, providerConfigured } from './lib/utils'

export type View = 'wizard' | 'library' | 'bank' | 'catalog' | 'settings' | 'preview'

const initialDraft: ExamConfig = {
  grade: 7,
  edition: 'renjiao',
  chapterIds: [],
  pageCount: 4,
  difficulty: 6,
  typeCount: 4,
  types: ['single_choice', 'fill_blank', 'calculation', 'solution'],
  manualCounts: {},
  totalScore: 100,
  durationMinutes: 90,
  capstoneCount: 2,
  calculationLoad: 3,
  thinkingLoad: 3,
  answerSpace: 'standard',
  includeAnswerSheet: true,
  title: defaultTitle(7),
  exportFormats: ['pdf', 'docx'],
  notes: '',
  avoidCrossPaperDuplicates: false
}

const DRAFT_KEY = 'lingdian:draft:v1'

function loadDraft(): ExamConfig {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return initialDraft
    const parsed = examConfigSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return initialDraft
    const validIds = new Set(
      getChapters(parsed.data.edition, parsed.data.grade).map(
        (chapter) => chapter.id
      )
    )
    return {
      ...parsed.data,
      chapterIds: parsed.data.chapterIds.filter((id) => validIds.has(id))
    }
  } catch {
    return initialDraft
  }
}

export default function App() {
  const [view, setView] = useState<View>('wizard')
  const [draft, setDraft] = useState<ExamConfig>(loadDraft)
  const [paper, setPaper] = useState<Paper | null>(null)
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [libraryRevision, setLibraryRevision] = useState(0)

  useEffect(() => {
    void Promise.all([window.chujuan.getSettings(), window.chujuan.getAppInfo()])
      .then(([nextSettings, nextAppInfo]) => {
        setSettings(nextSettings)
        setAppInfo(nextAppInfo)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Draft persistence is best effort.
    }
  }, [draft])

  const refreshSettings = useCallback(async () => {
    const next = await window.chujuan.getSettings()
    setSettings(next)
  }, [])

  useEffect(() => {
    if (view === 'settings') void refreshSettings().catch(() => undefined)
  }, [view, refreshSettings])

  const openPaper = useCallback(async (id: string) => {
    const next = await window.chujuan.getPaper(id)
    if (!next) return
    setPaper(next)
    setView('preview')
  }, [])

  const startNew = useCallback(() => {
    setDraft(initialDraft)
    setPaper(null)
    setView('wizard')
  }, [])

  const navItems = [
    { key: 'wizard' as const, label: '新建试卷', icon: FilePlus2 },
    { key: 'library' as const, label: '试卷库', icon: Files },
    { key: 'bank' as const, label: '本地题库', icon: LibraryBig },
    { key: 'catalog' as const, label: '教材目录', icon: BookOpen },
    { key: 'settings' as const, label: 'AI 设置', icon: Settings2 }
  ]
  const aiReady = providerConfigured(settings?.profile)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={startNew} title="新建试卷">
          <span className="brand-mark">0</span>
          <span className="brand-copy">
            <strong>零点</strong>
            <span>出卷</span>
          </span>
        </button>

        <button className="sidebar-primary" onClick={startNew}>
          <FilePlus2 size={17} />
          新建试卷
        </button>

        <nav className="sidebar-nav" aria-label="主导航">
          {navItems.slice(1).map((item) => {
            const Icon = item.icon
            const active =
              view === item.key || (view === 'preview' && item.key === 'library')
            return (
              <button
                key={item.key}
                className={active ? 'nav-item active' : 'nav-item'}
                onClick={() => setView(item.key)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span className={aiReady ? 'status-dot ready' : 'status-dot'} />
          <div>
            <strong>{aiReady ? 'AI 已配置' : '尚未配置 AI'}</strong>
            <span>{settings?.profile.model ?? '请填写接口信息'}</span>
          </div>
        </div>
      </aside>

      <main className="main-surface">
        {view === 'wizard' && (
          <WizardScreen
            draft={draft}
            onChange={setDraft}
            settings={settings}
            appInfo={appInfo}
            onOpenSettings={() => setView('settings')}
            onGenerated={(nextPaper) => {
              setPaper(nextPaper)
              setLibraryRevision((value) => value + 1)
              setView('preview')
            }}
          />
        )}
        {view === 'library' && (
          <LibraryScreen
            revision={libraryRevision}
            onOpenPaper={openPaper}
            onNew={startNew}
            onDeleted={() => setLibraryRevision((value) => value + 1)}
          />
        )}
        {view === 'bank' && <QuestionBankScreen revision={libraryRevision} />}
        {view === 'catalog' && <CatalogScreen />}
        {view === 'settings' && (
          <SettingsScreen
            settings={settings}
            appInfo={appInfo}
            onChanged={refreshSettings}
          />
        )}
        {view === 'preview' && paper && (
          <PreviewScreen
            paper={paper}
            onPaperChanged={(nextPaper) => {
              setPaper(nextPaper)
              setLibraryRevision((value) => value + 1)
            }}
            onBack={() => setView('library')}
            onNew={startNew}
          />
        )}
      </main>
    </div>
  )
}

