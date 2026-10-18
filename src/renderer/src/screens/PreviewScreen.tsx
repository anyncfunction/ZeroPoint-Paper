import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  FileType2,
  FolderOpen,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  CopyPlus,
  Trash2,
  X
} from 'lucide-react'
import type {
  ExportFormat,
  Paper,
  Question
} from '../../../shared/schemas'
import { EDITION_LABELS, GRADE_LABELS, questionSchema } from '../../../shared/schemas'
import {
  answerSpaceMm,
  buildFlowItems,
  packWithSpaceFit,
  paginatePaper,
  type FlowItem
} from '../../../shared/pagination'
import { chapterDisplayName, getSelectedChapters } from '../../../shared/curriculum'
import {
  deleteQuestion,
  duplicateQuestion,
  moveQuestion
} from '../../../shared/paper-edit'
import { FigurePreview } from '../components/FigurePreview'
import { RichText } from '../components/RichText'
import { difficultyLabel, errorMessage } from '../lib/utils'

interface PreviewProps {
  paper: Paper
  onPaperChanged: (paper: Paper) => void
  onBack: () => void
  onNew: () => void
}

interface EditTarget {
  sectionIndex: number
  questionIndex: number
}

interface MeasuredPage {
  items: FlowItem[]
}

const MEASURE_BUFFER = 12

function answerSpaceClass(type: Question['type']): string {
  return `preview-answer-space ${type}`
}

export function PreviewScreen({ paper, onPaperChanged, onBack, onNew }: PreviewProps) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [editDraft, setEditDraft] = useState<Question | null>(null)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [hardening, setHardening] = useState(false)
  const [hardenMessage, setHardenMessage] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formats, setFormats] = useState<ExportFormat[]>(paper.config.exportFormats)
  const [includeAnswerSheet, setIncludeAnswerSheet] = useState(paper.config.includeAnswerSheet)
  const [zoom, setZoom] = useState(1)
  const [exportFolder, setExportFolder] = useState('')
  const [exportedFiles, setExportedFiles] = useState<string[]>([])
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [measuredPages, setMeasuredPages] = useState<MeasuredPage[] | null>(null)
  const [spaceScale, setSpaceScale] = useState(1)

  useEffect(() => {
    if (!editing) return
    const question = paper.sections[editing.sectionIndex]?.questions[editing.questionIndex]
    if (!question) return
    setEditDraft(structuredClone(question))
  }, [editing, paper])

  useEffect(() => {
    return window.chujuan.onProgress((event) => {
      if (hardening && (event.stage === 'generating' || event.stage === 'validating')) {
        setHardenMessage(event.message)
      }
    })
  }, [hardening])

  const estimatedPages = useMemo(() => {
    try {
      return paginatePaper(paper, { allowOverflow: true }).map((page) => ({
        items: page.items
      }))
    } catch {
      return []
    }
  }, [paper])

  const flowItems = useMemo(() => buildFlowItems(paper), [paper])

  useEffect(() => {
    let cancelled = false
    setMeasuredPages(null)

    const measure = (): void => {
      const container = measureRef.current
      if (!container || cancelled) return
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>('[data-flow-index]')
      )
      const heights = nodes.map((node) => {
        const space = node.querySelector<HTMLElement>('.preview-answer-space')
        return {
          total: node.getBoundingClientRect().height + MEASURE_BUFFER,
          space: space ? space.getBoundingClientRect().height : 0
        }
      })
      const fitted = packWithSpaceFit(
        flowItems,
        heights.map((item) => Math.max(0, item.total - item.space)),
        heights.map((item) => item.space),
        paper.config.pageCount
      )
      if (!cancelled) {
        setMeasuredPages(fitted.pages.map((page) => ({ items: page.items })))
        setSpaceScale(fitted.spaceScale)
      }
    }

    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => requestAnimationFrame(measure))
    )
    return () => {
      cancelled = true
    }
  }, [flowItems, paper.config.pageCount])

  const chapterNames = getSelectedChapters(paper.config.chapterIds).map(chapterDisplayName)
  const pages = measuredPages ?? estimatedPages
  const hasPageOverflow =
    pages.length > paper.config.pageCount

  const commitPaper = async (nextPaper: Paper): Promise<boolean> => {
    setSaving(true)
    setError('')
    try {
      await window.chujuan.savePaper({
        ...nextPaper,
        updatedAt: new Date().toISOString()
      })
      onPaperChanged({
        ...nextPaper,
        updatedAt: new Date().toISOString()
      })
      return true
    } catch (nextError) {
      setError(errorMessage(nextError))
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveQuestion = async (): Promise<void> => {
    if (!editing || !editDraft) return
    const validation = questionSchema.safeParse(editDraft)
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? '题目内容有误')
      return
    }
    const next = structuredClone(paper)
    next.sections[editing.sectionIndex].questions[editing.questionIndex] = validation.data
    const success = await commitPaper(next)
    if (success) {
      setEditing(null)
      setEditDraft(null)
      setNotice('题目修改已保存')
    }
  }

  const regenerate = async (): Promise<void> => {
    if (!editing) return
    setRegenerating(true)
    setError('')
    try {
      const replacement = await window.chujuan.regenerateQuestion(
        paper,
        editing.sectionIndex,
        editing.questionIndex
      )
      const next = structuredClone(paper)
      next.sections[editing.sectionIndex].questions[editing.questionIndex] = replacement
      const success = await commitPaper(next)
      if (success) {
        setEditDraft(replacement)
        setNotice('已更换这一道题')
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setRegenerating(false)
    }
  }

  const hardenCurrentPaper = async (): Promise<void> => {
    setHardening(true)
    setError('')
    setNotice('')
    setHardenMessage('正在准备拔高')
    try {
      const strengthened = await window.chujuan.hardenPaper(paper)
      onPaperChanged(strengthened)
      setNotice('已完成整卷拔高，原版本已保存到试卷库')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setHardening(false)
    }
  }

  const hardenCurrentQuestion = async (): Promise<void> => {
    if (!editing) return
    setHardening(true)
    setError('')
    setNotice('')
    setHardenMessage('正在拔高当前题目')
    try {
      const strengthened = await window.chujuan.hardenPaper(
        paper,
        editing.sectionIndex,
        editing.questionIndex
      )
      const nextQuestion =
        strengthened.sections[editing.sectionIndex]?.questions[editing.questionIndex]
      onPaperChanged(strengthened)
      if (nextQuestion) setEditDraft(nextQuestion)
      setNotice('本题已拔高并独立复核，原版本已保存到试卷库')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setHardening(false)
    }
  }

  const toggleFormat = (format: ExportFormat): void => {
    const exists = formats.includes(format)
    if (exists && formats.length === 1) return
    setFormats(exists ? formats.filter((value) => value !== format) : [...formats, format])
  }

  const exportNow = async (): Promise<void> => {
    setExporting(true)
    setError('')
    setNotice('')
    try {
      const result = await window.chujuan.exportPaper(paper, formats, includeAnswerSheet)
      setExportFolder(result.outputFolder)
      setExportedFiles(result.files)
      setNotice('试卷与答案文件已导出')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setExporting(false)
    }
  }

  const fitPageCount = async (): Promise<void> => {
    if (!hasPageOverflow) return
    const next = structuredClone(paper)
    next.config.pageCount = pages.length
    const success = await commitPaper(next)
    if (success) setNotice(`已调整为 ${pages.length} 页`)
  }

  const bumpPageCount = async (): Promise<void> => {
    const target = Math.min(16, paper.config.pageCount + 1)
    if (target === paper.config.pageCount) return
    const next = structuredClone(paper)
    next.config.pageCount = target
    const success = await commitPaper(next)
    if (success) setNotice(`已调整为 ${target} 页`)
  }

  const moveCurrent = async (direction: -1 | 1): Promise<void> => {
    if (!editing) return
    const next = moveQuestion(
      paper,
      editing.sectionIndex,
      editing.questionIndex,
      direction
    )
    const success = await commitPaper(next)
    if (success) {
      const target = editing.questionIndex + direction
      setEditing({ ...editing, questionIndex: target })
      setNotice('已调整题目顺序')
    }
  }

  const deleteCurrent = async (): Promise<void> => {
    if (!editing) return
    if (!window.confirm('删除这一道题？删除后会自动重新分配分值。')) return
    try {
      const next = deleteQuestion(paper, editing.sectionIndex, editing.questionIndex)
      const success = await commitPaper(next)
      if (success) {
        setEditing(null)
        setEditDraft(null)
        setNotice('题目已删除，分值已重新分配')
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  const duplicateCurrent = async (): Promise<void> => {
    if (!editing) return
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const next = duplicateQuestion(
      paper,
      editing.sectionIndex,
      editing.questionIndex,
      newId
    )
    const success = await commitPaper(next)
    if (success) {
      setEditing({ ...editing, questionIndex: editing.questionIndex + 1 })
      setNotice('已复制为下一题，记得修改题干')
    }
  }

  const updateDraft = <K extends keyof Question>(key: K, value: Question[K]): void => {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <div className="preview-screen">
      <header className="preview-header">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={16} />
          试卷库
        </button>
        <div className="preview-title">
          <span className="section-kicker">试卷预览</span>
          <h1>{paper.config.title}</h1>
          <p>
            {GRADE_LABELS[paper.config.grade]} · {EDITION_LABELS[paper.config.edition]} ·
            正文 {paper.config.pageCount} 页 · {paper.plan.totalQuestions} 题
          </p>
        </div>
        <div className="preview-actions">
          <button className="secondary-button" onClick={onNew}>新建试卷</button>
          <button
            className="secondary-button"
            onClick={hardenCurrentPaper}
            disabled={hardening || exporting}
            title="保存当前版本后，对整卷执行拔高和独立复核"
          >
            <TrendingUp size={16} />
            整卷再拔高
          </button>
          <button className="primary-button" onClick={exportNow} disabled={exporting || hardening}>
            {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            导出
          </button>
        </div>
      </header>

      <div className="preview-layout">
        <section className="paper-stage">
          <div className="paper-stage-toolbar">
            <span><FileText size={15} />A4 纵向 · 黑白打印</span>
            <span className="ai-review-note"><AlertTriangle size={14} />AI 生成，请审校后再使用</span>
            <div className="zoom-control">
              <button
                className="icon-button"
                onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 10) / 10))}
                title="缩小"
              >
                <Minus size={14} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                className="icon-button"
                onClick={() => setZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))}
                title="放大"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {hasPageOverflow && (
            <div className="page-overflow-warning">
              <AlertTriangle size={15} />
              <span>
                当前内容完整排版需要 {pages.length} 页，设置为 {paper.config.pageCount} 页。
              </span>
              <button onClick={fitPageCount}>调整为 {pages.length} 页</button>
            </div>
          )}
          {!hasPageOverflow && spaceScale < 0.6 && (
            <div className="page-overflow-warning">
              <AlertTriangle size={15} />
              <span>
                作答留白已压缩到 {Math.round(spaceScale * 100)}%，学生书写空间偏紧。
              </span>
              <button onClick={() => bumpPageCount()}>增加 1 页</button>
            </div>
          )}
          <div className="paper-preview-list" style={{ zoom }}>
              {pages.map((page, pageIndex) => (
                <article className="a4-preview" key={pageIndex}>
                  <div className="a4-page-inner">
                    {pageIndex === 0 && (
                      <header className="preview-exam-head">
                        <h2>{paper.config.title}</h2>
                        <p>
                          {GRADE_LABELS[paper.config.grade]}数学 · {paper.config.durationMinutes} 分钟 ·
                          满分 {paper.config.totalScore} 分
                        </p>
                        <div className="preview-identity">
                          <span>姓名：</span><span>班级：</span><span>学号：</span><span>得分：</span>
                        </div>
                        <small>考试范围：{chapterNames.join('；')}</small>
                      </header>
                    )}
                    <div className="preview-page-content">
                      {page.items.map((item, itemIndex) => (
                        <PreviewItem
                          key={`${item.kind}-${itemIndex}`}
                          item={item}
                          onEdit={setEditing}
                          spaceScale={spaceScale}
                        />
                      ))}
                    </div>
                    <footer className="preview-page-footer">
                      <span>零点出卷 · AI 辅助命题</span>
                      <span>第 {pageIndex + 1} 页 / 共 {pages.length} 页</span>
                      <span>请认真审题</span>
                    </footer>
                  </div>
                </article>
              ))}
          </div>
          <div className="paper-measure-flow" ref={measureRef} aria-hidden="true">
            {flowItems.map((item, index) => (
              <div className="paper-measure-item" data-flow-index={index} key={index}>
                <PreviewItem item={item} onEdit={() => undefined} spaceScale={spaceScale} />
              </div>
            ))}
          </div>
        </section>

        <aside className="preview-side">
          {editing && editDraft ? (
            <div className="edit-panel">
              <div className="edit-panel-head">
                <div>
                  <span className="section-kicker">编辑题目</span>
                  <h2>第 {editing.questionIndex + 1} 题</h2>
                </div>
                <button className="icon-button" onClick={() => setEditing(null)} title="关闭编辑">
                  <X size={17} />
                </button>
              </div>

              <label className="edit-field">
                <span>题干 <small>公式使用 $...$</small></span>
                <textarea
                  value={editDraft.stem}
                  onChange={(event) => updateDraft('stem', event.target.value)}
                />
              </label>
              <div className="edit-preview">
                <span>预览</span>
                <RichText text={editDraft.stem} />
              </div>

              {editDraft.type === 'single_choice' && (
                <div className="option-editor">
                  {editDraft.options.map((option, index) => (
                    <label key={option.key}>
                      <span>{option.key}</span>
                      <input
                        value={option.text}
                        onChange={(event) => {
                          const options = editDraft.options.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, text: event.target.value } : item
                          )
                          updateDraft('options', options)
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}

              <label className="edit-field">
                <span>答案</span>
                <textarea
                  value={editDraft.answer}
                  onChange={(event) => updateDraft('answer', event.target.value)}
                />
              </label>
              <label className="edit-field tall">
                <span>解析</span>
                <textarea
                  value={editDraft.explanation}
                  onChange={(event) => updateDraft('explanation', event.target.value)}
                />
              </label>

              <div className="edit-panel-actions">
                <button
                  className="secondary-button"
                  onClick={regenerate}
                  disabled={regenerating || saving || hardening}
                >
                  {regenerating ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
                  换一道
                </button>
                <button
                  className="secondary-button harden-question-button"
                  onClick={hardenCurrentQuestion}
                  disabled={regenerating || saving || hardening}
                >
                  {hardening ? <LoaderCircle size={15} className="spin" /> : <TrendingUp size={15} />}
                  再拔高
                </button>
                <button
                  className="primary-button"
                  onClick={saveQuestion}
                  disabled={saving || regenerating || hardening}
                >
                  {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                  保存修改
                </button>
              </div>

              <div className="edit-panel-secondary">
                <button
                  className="secondary-button"
                  onClick={() => moveCurrent(-1)}
                  disabled={editing.questionIndex === 0 || saving || regenerating}
                  title="与上一题交换"
                >
                  <ArrowUp size={14} />
                  上移
                </button>
                <button
                  className="secondary-button"
                  onClick={() => moveCurrent(1)}
                  disabled={
                    editing.questionIndex >=
                      (paper.sections[editing.sectionIndex]?.questions.length ?? 1) - 1 ||
                    saving ||
                    regenerating
                  }
                  title="与下一题交换"
                >
                  <ArrowDown size={14} />
                  下移
                </button>
                <button
                  className="secondary-button"
                  onClick={duplicateCurrent}
                  disabled={saving || regenerating}
                  title="复制为下一题"
                >
                  <CopyPlus size={14} />
                  复制
                </button>
                <button
                  className="secondary-button danger-text"
                  onClick={deleteCurrent}
                  disabled={
                    (paper.sections[editing.sectionIndex]?.questions.length ?? 1) <= 1 ||
                    saving ||
                    regenerating
                  }
                  title="删除本题并重算分值"
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="preview-summary-block">
                <span className="section-kicker">生成参数</span>
                <h2>{paper.plan.totalQuestions} 道题 · {paper.plan.totalScore} 分</h2>
                <dl>
                  <div><dt>教材</dt><dd>{EDITION_LABELS[paper.config.edition]} 2024</dd></div>
                  <div><dt>章节</dt><dd>{paper.config.chapterIds.length} 章</dd></div>
                  <div><dt>难度</dt><dd>{paper.config.difficulty}/10 · {difficultyLabel(paper.config.difficulty)}</dd></div>
                  <div><dt>题型</dt><dd>{paper.sections.length} 种</dd></div>
                <div><dt>答题卡</dt><dd>{includeAnswerSheet ? '另附 PDF' : '不生成'}</dd></div>
                {paper.usage && (
                  <div>
                    <dt>本次用量</dt>
                    <dd>
                      {paper.usage.totalTokens.toLocaleString('zh-CN')} tokens
                      {paper.usage.estimatedCost ? ` · ¥${paper.usage.estimatedCost.toFixed(2)}` : ''}
                    </dd>
                  </div>
                )}
                </dl>
                <div className="chapter-summary">
                  {getSelectedChapters(paper.config.chapterIds).map((chapter) => (
                    <span key={chapter.id}>{chapter.title}</span>
                  ))}
                </div>
              </div>

              <div className="export-block">
                <span className="section-kicker">导出文件</span>
                <button
                  className={formats.includes('pdf') ? 'export-format selected' : 'export-format'}
                  onClick={() => toggleFormat('pdf')}
                >
                  <FileText size={18} />
                  <span><strong>PDF</strong><small>试卷 + 答案，共 2 个文件</small></span>
                  {formats.includes('pdf') && <Check size={15} />}
                </button>
                <button
                  className={formats.includes('docx') ? 'export-format selected' : 'export-format'}
                  onClick={() => toggleFormat('docx')}
                >
                  <FileType2 size={18} />
                  <span><strong>Word</strong><small>试卷 + 答案，共 2 个文件</small></span>
                  {formats.includes('docx') && <Check size={15} />}
                </button>
                <button
                  className={includeAnswerSheet ? 'export-format selected' : 'export-format'}
                  onClick={() => setIncludeAnswerSheet((value) => !value)}
                >
                  <FileText size={18} />
                  <span><strong>答题卡</strong><small>单独 A4 PDF，可选</small></span>
                  {includeAnswerSheet && <Check size={15} />}
                </button>
                <button
                  className="primary-button full-button"
                  onClick={exportNow}
                  disabled={exporting || hasPageOverflow}
                  title={hasPageOverflow ? '请先调整页数' : '导出试卷与答案'}
                >
                  {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                  导出到文档
                </button>
                {exportFolder && (
                  <div className="export-result">
                    <div><Check size={15} /> 已生成 {exportedFiles.length} 个文件</div>
                    <button onClick={() => window.chujuan.openOutputFolder(exportFolder)}>
                      <FolderOpen size={14} />打开文件夹
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="side-error"><AlertTriangle size={15} /><span>{error}</span></div>
          )}
          {notice && (
            <div className="side-notice"><Sparkles size={15} /><span>{notice}</span></div>
          )}
        </aside>
      </div>
      {hardening && (
        <div className="modal-backdrop">
          <div className="progress-dialog" role="dialog" aria-modal="true">
            <div className="progress-orb"><LoaderCircle size={26} className="spin" /></div>
            <span className="section-kicker">难度提升与独立复核</span>
            <h2>{hardenMessage}</h2>
            <p>会先保存当前版本，再进行拔高和答案验算。</p>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewItem({
  item,
  onEdit,
  spaceScale = 1
}: {
  item: FlowItem
  onEdit: (target: EditTarget) => void
  spaceScale?: number
}) {
  if (item.kind === 'spacer') {
    return <div style={{ height: `${item.heightMm}mm` }} />
  }
  if (item.kind === 'section') {
    return (
      <div className="preview-section-head">
        <h3>{item.title}</h3>
        <span>（共 {item.totalScore} 分）</span>
        <p>{item.instructions}</p>
      </div>
    )
  }

  const question = item.question
  return (
    <div className="preview-question">
      <div className="preview-question-line">
        <span className="preview-number">{item.number}.</span>
        <div className="preview-question-body">
          <div className="preview-stem"><RichText text={question.stem} /></div>
          {question.options.length > 0 && (
            <div className="preview-options">
              {question.options.map((option) => (
                <span key={option.key}><strong>{option.key}.</strong><RichText text={option.text} /></span>
              ))}
            </div>
          )}
          {question.figure && <FigurePreview figure={question.figure} compact />}
          <div className="preview-question-meta">
            <span>（{question.score} 分）</span>
            <button
              className="edit-question-button"
              onClick={() =>
                onEdit({
                  sectionIndex: item.sectionIndex,
                  questionIndex: item.questionIndex
                })
              }
            >
              <Edit3 size={13} />编辑
            </button>
          </div>
          <div
            className={answerSpaceClass(question.type)}
            style={{ height: `${(answerSpaceMm(question.type) * spaceScale).toFixed(2)}mm` }}
          />
        </div>
      </div>
    </div>
  )
}

