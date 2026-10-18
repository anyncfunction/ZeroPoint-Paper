import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  FileType2,
  KeyRound,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react'
import {
  examConfigSchema,
  type AppInfo,
  type Chapter,
  type ExamConfig,
  type ExamPlan,
  type Paper,
  type ProgressEvent,
  type QuestionType,
  type SettingsSnapshot
} from '../../../shared/schemas'
import {
  DIFFICULTY_LABELS,
  EDITION_OPTIONS,
  GRADE_OPTIONS,
  QUESTION_TYPE_OPTIONS
} from '../../../shared/constants'
import { chapterDisplayName } from '../../../shared/curriculum'
import {
  difficultyLabel,
  errorMessage,
  explainGenerationFailure,
  gradeLabel,
  providerConfigured,
  suggestedTypes,
  type GenerationFailure
} from '../lib/utils'

const STEPS = [
  { number: '01', title: '基础信息' },
  { number: '02', title: '章节与难度' },
  { number: '03', title: '题型与分值' },
  { number: '04', title: '确认生成' }
]

interface WizardProps {
  draft: ExamConfig
  onChange: (config: ExamConfig) => void
  settings: SettingsSnapshot | null
  appInfo: AppInfo | null
  onOpenSettings: () => void
  onGenerated: (paper: Paper) => void
}

function Stepper({
  current,
  onSelect
}: {
  current: number
  onSelect: (step: number) => void
}) {
  return (
    <div className="wizard-stepper">
      {STEPS.map((step, index) => (
        <button
          key={step.number}
          className={[
            'wizard-step',
            index === current ? 'current' : '',
            index < current ? 'complete' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => index <= current && onSelect(index)}
          disabled={index > current}
        >
          <span className="step-number">{index < current ? <Check size={14} /> : step.number}</span>
          <span>
            <small>步骤 {index + 1}</small>
            <strong>{step.title}</strong>
          </span>
        </button>
      ))}
    </div>
  )
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
  suffix
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  suffix?: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)))
    setDraft(String(next))
    onChange(next)
  }

  return (
    <div className="number-stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        title="减少"
      >
        <Minus size={15} />
      </button>
      <label>
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onWheel={(event) => event.currentTarget.blur()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          aria-label={suffix ? `数值，单位${suffix}` : '数值'}
        />
        {suffix && <small>{suffix}</small>}
      </label>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        title="增加"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

function InlineNumberField({
  value,
  onChange,
  min = 1,
  max = 50
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)))
    setDraft(String(next))
    onChange(next)
  }

  return (
    <input
      className="type-count-input"
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onWheel={(event) => event.currentTarget.blur()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-label="题型题量"
    />
  )
}

export function WizardScreen({
  draft,
  onChange,
  settings,
  appInfo,
  onOpenSettings,
  onGenerated
}: WizardProps) {
  const [step, setStep] = useState(0)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ExamPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [generationError, setGenerationError] = useState<GenerationFailure | null>(null)

  useEffect(() => {
    setChapters([])
    void window.chujuan
      .listChapters(draft.edition, draft.grade)
      .then(setChapters)
      .catch((nextError) => setError(errorMessage(nextError)))
  }, [draft.edition, draft.grade])

  useEffect(() => {
    return window.chujuan.onProgress((event) => {
      setProgress(event)
      if (event.stage === 'error') {
        setGenerating(false)
      }
    })
  }, [])

  useEffect(() => {
    if (step < 2 || draft.chapterIds.length === 0) return
    void window.chujuan
      .preflight(draft)
      .then(setPlan)
      .catch(() => setPlan(null))
  }, [
    step,
    draft.chapterIds.length,
    draft.pageCount,
    draft.difficulty,
    draft.typeCount,
    draft.types.join(','),
    draft.manualCounts,
    draft.totalScore,
    draft.avoidCrossPaperDuplicates
  ])

  const groupedChapters = useMemo(
    () => ({
      上册: chapters.filter((chapter) => chapter.volume === '上册'),
      下册: chapters.filter((chapter) => chapter.volume === '下册')
    }),
    [chapters]
  )
  const selectedSet = new Set(draft.chapterIds)
  const chapterNames = chapters
    .filter((chapter) => selectedSet.has(chapter.id))
    .map((chapter) => chapter.title)
    .join('、')
  const providerReady = providerConfigured(settings?.profile)

  const update = <K extends keyof ExamConfig>(key: K, value: ExamConfig[K]): void => {
    onChange({ ...draft, [key]: value })
  }

  const setGrade = (grade: 7 | 8 | 9): void => {
    const shouldUpdateTitle =
      !draft.title.trim() || /^[七八九]年级数学阶段检测$/.test(draft.title)
    onChange({
      ...draft,
      grade,
      chapterIds: [],
      title: shouldUpdateTitle
        ? `${gradeLabel(grade)}数学阶段检测`
        : draft.title
    })
    setPlan(null)
  }

  const setEdition = (edition: ExamConfig['edition']): void => {
    onChange({ ...draft, edition, chapterIds: [] })
    setPlan(null)
  }

  const toggleChapter = (chapterId: string): void => {
    const exists = draft.chapterIds.includes(chapterId)
    onChange({
      ...draft,
      chapterIds: exists
        ? draft.chapterIds.filter((id) => id !== chapterId)
        : [...draft.chapterIds, chapterId]
    })
  }

  const setTypeCount = (count: number): void => {
    onChange({
      ...draft,
      typeCount: count,
      types: suggestedTypes(count, chapterNames),
      manualCounts: {}
    })
    setPlan(null)
  }

  const toggleType = (type: QuestionType): void => {
    const exists = draft.types.includes(type)
    if (!exists && draft.types.length >= draft.typeCount) {
      setError(`已选满 ${draft.typeCount} 种题型，请先取消一种`)
      return
    }
    if (exists && draft.types.length === 1) {
      setError('至少保留一种题型')
      return
    }
    setError('')
    const nextTypes = exists
      ? draft.types.filter((value) => value !== type)
      : [...draft.types, type]
    const nextCounts = { ...draft.manualCounts }
    if (exists) delete nextCounts[type]
    onChange({
      ...draft,
      types: nextTypes,
      manualCounts: nextCounts
    })
  }

  const setManualCount = (type: QuestionType, value: number): void => {
    onChange({
      ...draft,
      manualCounts: {
        ...draft.manualCounts,
        [type]: Math.max(1, Math.min(50, value))
      }
    })
  }

  const validateCurrentStep = (): boolean => {
    if (step === 1 && draft.chapterIds.length === 0) {
      setError('请至少选择一个章节')
      return false
    }
    if (step === 2 && draft.types.length === 0) {
      setError('请至少选择一种题型')
      return false
    }
    if (step === 3) {
      const parsed = examConfigSchema.safeParse(draft)
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? '请检查试卷信息')
        return false
      }
    }
    setError('')
    return true
  }

  const goNext = async (): Promise<void> => {
    if (!validateCurrentStep()) return
    if (step === 2) {
      try {
        setPlan(await window.chujuan.preflight(draft))
      } catch (nextError) {
        setError(errorMessage(nextError))
        return
      }
    }
    if (step < 3) setStep(step + 1)
  }

  const generate = async (): Promise<void> => {
    if (!validateCurrentStep()) return
    if (!providerReady) {
      setError('请先在 AI 设置中配置接口和 API Key')
      return
    }
    setGenerating(true)
    setError('')
    setGenerationError(null)
    setProgress({ stage: 'preparing', message: '正在准备试卷结构' })
    try {
      await window.chujuan.preflight(draft)
      const nextPaper = await window.chujuan.generatePaper(draft)
      setGenerating(false)
      onGenerated(nextPaper)
    } catch (nextError) {
      setGenerating(false)
      const message = errorMessage(nextError)
      if (/已取消生成|AbortError/i.test(message)) {
        setProgress(null)
        return
      }
      setGenerationError(explainGenerationFailure(nextError))
      setProgress({ stage: 'error', message: '生成失败' })
    }
  }

  const retryGeneration = (): void => {
    setGenerationError(null)
    setProgress(null)
    void generate()
  }

  return (
    <div className="screen wizard-screen">
      <header className="screen-heading">
        <div>
          <p className="eyebrow">新建试卷 · 初中数学</p>
          <h1>把这套卷子定义清楚</h1>
          <p>四项信息，系统负责出题、校验、排版与导出。</p>
        </div>
        <div className={providerReady ? 'provider-pill ready' : 'provider-pill warning'}>
          <KeyRound size={15} />
          {providerReady ? settings?.profile.model : '尚未配置 AI'}
          {!providerReady && (
            <button onClick={onOpenSettings}>去设置</button>
          )}
        </div>
      </header>

      <Stepper current={step} onSelect={setStep} />

      <div className="wizard-summary-bar" aria-label="当前配置摘要">
        <span><strong>{gradeLabel(draft.grade)}</strong></span>
        <span>{EDITION_OPTIONS.find((item) => item.value === draft.edition)?.label}</span>
        <span>{draft.chapterIds.length} 章</span>
        <span>{draft.pageCount} 页</span>
        <span>{plan?.totalQuestions ?? '—'} 题</span>
        <span>{draft.totalScore} 分</span>
        <span>难度 {draft.difficulty}</span>
        {draft.avoidCrossPaperDuplicates && <span className="summary-flag">跨卷去重</span>}
        {draft.includeAnswerSheet && <span className="summary-flag">附答题卡</span>}
      </div>

      <section className="wizard-panel">
        {step === 0 && (
          <div className="wizard-content enter">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">STEP 01</span>
                <h2>年级与教材</h2>
                <p>先定年级，本版数学章节会随后加载。</p>
              </div>
              <span className="subject-badge">数学</span>
            </div>

            <div className="field-block">
              <label className="field-label">年级</label>
              <div className="choice-grid grade-grid">
                {GRADE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={draft.grade === option.value ? 'choice-tile selected' : 'choice-tile'}
                    onClick={() => setGrade(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>初中数学</span>
                    {draft.grade === option.value && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-block">
              <label className="field-label">教材版本</label>
              <div className="edition-grid">
                {EDITION_OPTIONS.map((edition) => (
                  <button
                    key={edition.value}
                    className={
                      draft.edition === edition.value ? 'edition-option selected' : 'edition-option'
                    }
                    onClick={() => setEdition(edition.value)}
                  >
                    <span className="edition-radio">
                      {draft.edition === edition.value && <span />}
                    </span>
                    <span>
                      <strong>{edition.label}</strong>
                      <small>{edition.version}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-content enter">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">STEP 02</span>
                <h2>章节与难度</h2>
                <p>可跨上下册任意选章，所有题目只在选中范围内命制。</p>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  onChange({
                    ...draft,
                    chapterIds:
                      draft.chapterIds.length === chapters.length
                        ? []
                        : chapters.map((chapter) => chapter.id)
                  })
                }
              >
                {draft.chapterIds.length === chapters.length ? '清空选择' : '全选本章册'}
              </button>
            </div>

            <div className="chapter-selector">
              {(['上册', '下册'] as const).map((volume) => (
                <div className="volume-block" key={volume}>
                  <div className="volume-title">
                    <ChevronDown size={15} />
                    <strong>{gradeLabel(draft.grade)}{volume}</strong>
                    <span>{groupedChapters[volume].length} 章</span>
                  </div>
                  <div className="chapter-list">
                    {groupedChapters[volume].map((chapter) => {
                      const checked = selectedSet.has(chapter.id)
                      return (
                        <button
                          key={chapter.id}
                          className={checked ? 'chapter-row selected' : 'chapter-row'}
                          onClick={() => toggleChapter(chapter.id)}
                        >
                          <span className={checked ? 'checkbox checked' : 'checkbox'}>
                            {checked && <Check size={13} />}
                          </span>
                          <span className="chapter-number">第{chapter.chapterNumber}章</span>
                          <span className="chapter-name">{chapter.title}</span>
                          <span className="chapter-points">
                            {chapter.knowledgePoints.slice(0, 2).join(' · ')}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="range-grid">
              <div className="field-block compact">
                <label className="field-label">正文页数</label>
                <div className="inline-control">
                  <NumberStepper
                    value={draft.pageCount}
                    min={1}
                    max={16}
                    onChange={(value) => update('pageCount', value)}
                    suffix="页"
                  />
                  <span className="field-hint">A4 纵向，严格卡准</span>
                </div>
              </div>

              <div className="field-block compact difficulty-field">
                <label className="field-label">
                  难度 <strong>{draft.difficulty}</strong>
                  <span>{difficultyLabel(draft.difficulty)}</span>
                </label>
                <input
                  className="difficulty-range"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={draft.difficulty}
                  onChange={(event) => update('difficulty', Number(event.target.value))}
                  style={{ '--range-progress': `${((draft.difficulty - 1) / 9) * 100}%` } as React.CSSProperties}
                />
                <div className="difficulty-ticks">
                  <span>基础</span>
                  <span>中等</span>
                  <span>压轴</span>
                </div>
                {draft.difficulty >= 9 && (
                  <div className="difficulty-hard-hint">
                    高难模式会强制多步综合、知识联动和压轴级设问。
                  </div>
                )}
              </div>
            </div>

            <div className="range-grid tuning-grid">
              <div className="field-block compact">
                <label className="field-label">
                  计算量 <strong>{draft.calculationLoad}</strong>
                  <span>控制运算步数与数据复杂度</span>
                </label>
                <div className="segmented compact-segments">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      className={draft.calculationLoad === value ? 'selected' : ''}
                      onClick={() => update('calculationLoad', value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-block compact">
                <label className="field-label">
                  思维量 <strong>{draft.thinkingLoad}</strong>
                  <span>控制推理转折与知识综合</span>
                </label>
                <div className="segmented compact-segments">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      className={draft.thinkingLoad === value ? 'selected' : ''}
                      onClick={() => update('thinkingLoad', value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {draft.difficulty >= 8 && (
              <div className="field-block compact capstone-field">
                <label className="field-label">
                  压轴题数量
                  <span>只让最后几道达到 10 级，其余保持 9 级</span>
                </label>
                <NumberStepper
                  value={draft.capstoneCount}
                  min={0}
                  max={8}
                  onChange={(value) => update('capstoneCount', value)}
                  suffix="题"
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-content enter">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">STEP 03</span>
                <h2>题型与题量</h2>
                <p>系统先给建议组合，点选题型可以替换，展开后可微调题量。</p>
              </div>
              {plan && (
                <div className="plan-summary-inline">
                  <strong>{plan.totalQuestions}</strong> 题
                  <span>·</span>
                  <strong>{plan.totalScore}</strong> 分
                </div>
              )}
            </div>

            <div className="field-block compact">
              <label className="field-label">题型数量</label>
              <div className="segmented">
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    className={draft.typeCount === count ? 'selected' : ''}
                    onClick={() => setTypeCount(count)}
                  >
                    {count} 种
                  </button>
                ))}
              </div>
            </div>

            <div className="type-pool">
              {QUESTION_TYPE_OPTIONS.map((option) => {
                const selected = draft.types.includes(option.value)
                const target = plan?.sections.find((section) => section.type === option.value)
                const count =
                  draft.manualCounts[option.value] ?? target?.questionCount ?? '—'
                return (
                  <div
                    key={option.value}
                    className={selected ? 'type-option selected' : 'type-option'}
                  >
                    <button
                      className="type-option-main"
                      onClick={() => toggleType(option.value)}
                    >
                      <span className={selected ? 'type-check checked' : 'type-check'}>
                        {selected && <Check size={13} />}
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{selected ? '已加入本卷' : '点击加入'}</small>
                      </span>
                    </button>
                    {selected && (
                      <div className="type-count">
                        <button
                          onClick={() =>
                            setManualCount(option.value, typeof count === 'number' ? count - 1 : 1)
                          }
                          disabled={typeof count === 'number' && count <= 1}
                          title="减少题量"
                        >
                          <Minus size={13} />
                        </button>
                        <InlineNumberField
                          value={typeof count === 'number' ? count : 1}
                          onChange={(value) => setManualCount(option.value, value)}
                        />
                        <span>题</span>
                        <button
                          onClick={() =>
                            setManualCount(option.value, typeof count === 'number' ? count + 1 : 2)
                          }
                          title="增加题量"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="feature-options">
              <div>
                <span className="section-kicker">本地题库</span>
                <h3>跨卷去重</h3>
                <p>使用本地试卷库中的题干指纹，避免新卷出现以前出过的题。</p>
              </div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  aria-label="跨卷去重"
                  checked={draft.avoidCrossPaperDuplicates}
                  onChange={(event) =>
                    update('avoidCrossPaperDuplicates', event.target.checked)
                  }
                />
                <span className="switch-track"><span /></span>
                <strong>
                  {draft.avoidCrossPaperDuplicates ? '已开启' : '未开启'}
                </strong>
              </label>
            </div>

            <div className="feature-options answer-space-options">
              <div>
                <span className="section-kicker">卷面</span>
                <h3>答题留白</h3>
                <p>控制解答题预留空间，导出时按同一套留白排版。</p>
              </div>
              <div className="segmented compact-segments">
                {([
                  ['compact', '紧凑'],
                  ['standard', '标准'],
                  ['loose', '宽松']
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={draft.answerSpace === value ? 'selected' : ''}
                    onClick={() => update('answerSpace', value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="feature-options">
              <div>
                <span className="section-kicker">导出</span>
                <h3>另附答题卡</h3>
                <p>单独生成 A4 答题卡 PDF，包含选择题涂卡区和解答题作答框。</p>
              </div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  aria-label="另附答题卡"
                  checked={draft.includeAnswerSheet}
                  onChange={(event) =>
                    update('includeAnswerSheet', event.target.checked)
                  }
                />
                <span className="switch-track"><span /></span>
                <strong>{draft.includeAnswerSheet ? '已开启' : '未开启'}</strong>
              </label>
            </div>

            {plan?.warnings.length ? (
              <div className="inline-note amber">
                <AlertTriangle size={16} />
                <div>{plan.warnings.join(' ')}</div>
              </div>
            ) : (
              <div className="inline-note">
                <Sparkles size={16} />
                <div>当前组合会在选中章节之间轮换覆盖，避免某一章完全没有题目。</div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-content enter">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">STEP 04</span>
                <h2>确认并生成</h2>
                <p>备注只交给 AI，不会印到卷面上。</p>
              </div>
              <div className="safety-chip">
                <AlertTriangle size={14} />
                AI 生成后请审校
              </div>
            </div>

            <div className="confirm-layout">
              <div className="confirm-form">
                <div className="field-block compact">
                  <label className="field-label" htmlFor="paper-title">试卷标题</label>
                  <input
                    id="paper-title"
                    className="text-input large"
                    value={draft.title}
                    maxLength={60}
                    onChange={(event) => update('title', event.target.value)}
                  />
                </div>

                <div className="two-column-fields">
                  <div className="field-block compact">
                    <label className="field-label">总分</label>
                    <NumberStepper
                      value={draft.totalScore}
                      min={10}
                      max={300}
                      onChange={(value) => update('totalScore', value)}
                      suffix="分"
                    />
                  </div>
                  <div className="field-block compact">
                    <label className="field-label">考试时长</label>
                    <NumberStepper
                      value={draft.durationMinutes}
                      min={10}
                      max={300}
                      onChange={(value) => update('durationMinutes', value)}
                      suffix="分钟"
                    />
                  </div>
                </div>

                <div className="field-block compact">
                  <label className="field-label">导出格式</label>
                  <div className="format-options">
                    <button
                      className={draft.exportFormats.includes('pdf') ? 'format-option selected' : 'format-option'}
                      onClick={() => {
                        const has = draft.exportFormats.includes('pdf')
                        if (has && draft.exportFormats.length === 1) return
                        update(
                          'exportFormats',
                          has
                            ? draft.exportFormats.filter((format) => format !== 'pdf')
                            : [...draft.exportFormats, 'pdf']
                        )
                      }}
                    >
                      <FileText size={20} />
                      <span><strong>PDF</strong><small>直接打印</small></span>
                      <span className={draft.exportFormats.includes('pdf') ? 'format-check checked' : 'format-check'}>
                        {draft.exportFormats.includes('pdf') && <Check size={13} />}
                      </span>
                    </button>
                    <button
                      className={draft.exportFormats.includes('docx') ? 'format-option selected' : 'format-option'}
                      onClick={() => {
                        const has = draft.exportFormats.includes('docx')
                        if (has && draft.exportFormats.length === 1) return
                        update(
                          'exportFormats',
                          has
                            ? draft.exportFormats.filter((format) => format !== 'docx')
                            : [...draft.exportFormats, 'docx']
                        )
                      }}
                    >
                      <FileType2 size={20} />
                      <span><strong>Word</strong><small>后续可编辑</small></span>
                      <span className={draft.exportFormats.includes('docx') ? 'format-check checked' : 'format-check'}>
                        {draft.exportFormats.includes('docx') && <Check size={13} />}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="field-block compact">
                  <label className="field-label" htmlFor="paper-notes">
                    备注 <span>仅作为 AI 出题指令</span>
                  </label>
                  <textarea
                    id="paper-notes"
                    className="text-area"
                    value={draft.notes}
                    maxLength={500}
                    placeholder="例如：少出纯计算题，增加生活情境；最后一题不要超纲。"
                    onChange={(event) => update('notes', event.target.value)}
                  />
                  <span className="char-count">{draft.notes.length} / 500</span>
                </div>
              </div>

              <aside className="confirm-summary">
                <span className="section-kicker">试卷摘要</span>
                <h3>{draft.title || '未命名试卷'}</h3>
                <dl>
                  <div><dt>年级</dt><dd>{gradeLabel(draft.grade)}</dd></div>
                  <div><dt>教材</dt><dd>{EDITION_OPTIONS.find((item) => item.value === draft.edition)?.label}</dd></div>
                  <div><dt>章节</dt><dd>{draft.chapterIds.length} 章</dd></div>
                  <div><dt>篇幅</dt><dd>{draft.pageCount} 页</dd></div>
                  <div><dt>难度</dt><dd>{draft.difficulty} / 10</dd></div>
                  <div><dt>题型</dt><dd>{draft.types.length} 种</dd></div>
                  <div><dt>题量</dt><dd>{plan?.totalQuestions ?? '生成前计算'}</dd></div>
                </dl>
                <p className="summary-output">
                  导出 {draft.exportFormats.map((format) => format.toUpperCase()).join(' + ')}
                  <br />答案与解析将另存文件
                </p>
                {appInfo && <p className="summary-path">输出到文档 / 零点出卷 / 导出</p>}
              </aside>
            </div>
          </div>
        )}

        {error && (
          <div className="error-bar">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError('')} title="关闭"><X size={15} /></button>
          </div>
        )}

        <footer className="wizard-actions">
          <button
            className="secondary-button"
            onClick={() => (step === 0 ? undefined : setStep(step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft size={16} />
            上一步
          </button>
          <div className="action-spacer" />
          {step < 3 ? (
            <button className="primary-button" onClick={goNext}>
              下一步
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary-button generate-button" onClick={generate}>
              <Sparkles size={17} />
              生成试卷
            </button>
          )}
        </footer>
      </section>

      {(generating || generationError) && (
        <div className="modal-backdrop">
          {generationError ? (
            <div className="progress-dialog failure-dialog" role="alertdialog" aria-modal="true">
              <div className="failure-icon"><AlertTriangle size={26} /></div>
              <span className="section-kicker">生成未完成</span>
              <h2>{generationError.title}</h2>
              <p>{generationError.message}</p>
              <div className="failure-detail">
                <span>详细信息</span>
                <pre>{generationError.raw}</pre>
                <button
                  className="copy-error-button"
                  onClick={() => {
                    void navigator.clipboard.writeText(generationError.raw).catch(() => undefined)
                  }}
                  title="复制错误信息"
                >
                  <Copy size={13} />复制
                </button>
              </div>
              <div className="failure-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setGenerationError(null)
                    setProgress(null)
                    onOpenSettings()
                  }}
                >
                  打开 AI 设置
                </button>
                <button className="primary-button" onClick={retryGeneration}>
                  <RefreshCw size={15} />
                  重新生成
                </button>
              </div>
              <button
                className="close-failure"
                onClick={() => {
                  setGenerationError(null)
                  setProgress(null)
                }}
                title="关闭"
              >
                <X size={17} />
              </button>
            </div>
          ) : (
            <div className="progress-dialog" role="dialog" aria-modal="true">
              <div className="progress-orb"><LoaderCircle size={26} className="spin" /></div>
              <span className="section-kicker">AI 正在出卷</span>
              <h2>{progress?.message ?? '正在准备题目'}</h2>
              <p>
                分段生成与校验同时进行，
                {draft.difficulty >= 9
                  ? '压轴卷通常需要 2–3 分钟。'
                  : '通常需要 40–90 秒。'}
              </p>
              <div className="progress-track">
                <span
                  style={{
                    width:
                      progress?.current !== undefined && progress.total
                        ? `${Math.max(8, (progress.current / progress.total) * 100)}%`
                        : '18%'
                  }}
                />
              </div>
              <div className="progress-meta">
                <span>{progress?.stage === 'generating' ? '生成题目' : '准备结构'}</span>
                <span>
                  {progress?.current ?? 0} / {progress?.total ?? plan?.sections.length ?? 4}
                </span>
              </div>
              <button className="secondary-button cancel-generation" onClick={() => window.chujuan.cancelGeneration()}>
                取消生成
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

