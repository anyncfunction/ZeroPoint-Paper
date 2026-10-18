import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CopyPlus,
  FilePlus2,
  FolderOpen,
  MoreHorizontal,
  Search,
  Trash2
} from 'lucide-react'
import type { Grade, PaperSummary } from '../../../shared/schemas'
import { EDITION_LABELS } from '../../../shared/schemas'
import { errorMessage, formatDate, gradeLabel } from '../lib/utils'

interface LibraryProps {
  revision: number
  onOpenPaper: (id: string) => void
  onNew: () => void
  onDeleted: () => void
}

export function LibraryScreen({
  revision,
  onOpenPaper,
  onNew,
  onDeleted
}: LibraryProps) {
  const [papers, setPapers] = useState<PaperSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [grade, setGrade] = useState<Grade | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    void window.chujuan
      .listPapers()
      .then(setPapers)
      .catch((nextError) => setError(errorMessage(nextError)))
      .finally(() => setLoading(false))
  }, [revision])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    return papers.filter((paper) => {
      if (grade !== 'all' && paper.grade !== grade) return false
      if (!value) return true
      return (
        paper.title.toLowerCase().includes(value) ||
        gradeLabel(paper.grade).includes(value) ||
        EDITION_LABELS[paper.edition].includes(value)
      )
    })
  }, [papers, query, grade])

  const toggleSelected = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const removeSelected = async (): Promise<void> => {
    if (selected.size === 0) return
    if (!window.confirm(`从本地试卷库删除选中的 ${selected.size} 份试卷？已导出的文件不会删除。`)) {
      return
    }
    try {
      await window.chujuan.deletePapers([...selected])
      setPapers((current) => current.filter((item) => !selected.has(item.id)))
      setSelected(new Set())
      onDeleted()
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  const duplicate = async (paper: PaperSummary): Promise<void> => {
    try {
      await window.chujuan.duplicatePaper(paper.id)
      const next = await window.chujuan.listPapers()
      setPapers(next)
      onDeleted()
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  const remove = async (paper: PaperSummary): Promise<void> => {
    if (!window.confirm(`从本地试卷库删除“${paper.title}”？已导出的文件不会删除。`)) {
      return
    }
    try {
      await window.chujuan.deletePaper(paper.id)
      setPapers((current) => current.filter((item) => item.id !== paper.id))
      onDeleted()
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  return (
    <div className="screen library-screen">
      <header className="screen-heading library-heading">
        <div>
          <p className="eyebrow">本地试卷库</p>
          <h1>已经出过的卷子</h1>
          <p>参数、题目和编辑内容保存在本机，重新打开后可继续修改或导出。</p>
        </div>
        <button className="primary-button" onClick={onNew}>
          <FilePlus2 size={17} />
          新建试卷
        </button>
      </header>

      <div className="library-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            placeholder="搜索标题、年级或教材"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="segmented compact-segments grade-filter">
          <button className={grade === 'all' ? 'selected' : ''} onClick={() => setGrade('all')}>
            全部
          </button>
          {([7, 8, 9] as const).map((value) => (
            <button
              key={value}
              className={grade === value ? 'selected' : ''}
              onClick={() => setGrade(value)}
            >
              {value} 年级
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button className="secondary-button danger-text" onClick={removeSelected}>
            <Trash2 size={15} />
            删除 {selected.size} 份
          </button>
        )}
        <span className="library-count">{filtered.length} 份试卷</span>
      </div>

      {error && <div className="error-bar compact"><span>{error}</span></div>}

      {loading ? (
        <div className="empty-state"><span className="loading-line" />正在读取本地试卷库</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark"><FilePlus2 size={24} /></div>
          <h2>{papers.length === 0 ? '还没有生成过试卷' : '没有匹配的试卷'}</h2>
          <p>{papers.length === 0 ? '从第一份数学阶段检测开始。' : '换个关键词试试。'}</p>
          {papers.length === 0 && (
            <button className="primary-button" onClick={onNew}>新建试卷</button>
          )}
        </div>
      ) : (
        <div className="paper-table">
          <div className="paper-table-head">
            <span />
            <span>试卷</span>
            <span>范围</span>
            <span>篇幅</span>
            <span>更新时间</span>
            <span />
          </div>
          {filtered.map((paper) => (
            <div className="paper-row" key={paper.id}>
              <button
                className={selected.has(paper.id) ? 'row-check checked' : 'row-check'}
                onClick={() => toggleSelected(paper.id)}
                aria-label={selected.has(paper.id) ? '取消选择' : '选择试卷'}
              >
                {selected.has(paper.id) && <Check size={12} />}
              </button>
              <button className="paper-main" onClick={() => onOpenPaper(paper.id)}>
                <span className="paper-glyph">
                  <span>{paper.grade}</span>
                  <small>年级</small>
                </span>
                <span className="paper-title-cell">
                  <strong>{paper.title}</strong>
                  <small>
                    {paper.questionCount} 道题 · 难度 {paper.difficulty}/10
                    {paper.totalTokens ? ` · ${paper.totalTokens.toLocaleString('zh-CN')} tokens` : ''}
                  </small>
                </span>
              </button>
              <span className="paper-scope">
                {gradeLabel(paper.grade)} · {EDITION_LABELS[paper.edition]}
              </span>
              <span className="paper-pages">{paper.pageCount} 页</span>
              <span className="paper-time">{formatDate(paper.updatedAt)}</span>
              <div className="paper-actions">
                {paper.outputFolder && (
                  <button
                    className="icon-button"
                    title="打开导出目录"
                    onClick={() => window.chujuan.openOutputFolder(paper.outputFolder as string)}
                  >
                    <FolderOpen size={16} />
                  </button>
                )}
                <button className="icon-button" title="打开试卷" onClick={() => onOpenPaper(paper.id)}>
                  <MoreHorizontal size={17} />
                </button>
                <button className="icon-button" title="复制为新卷" onClick={() => duplicate(paper)}>
                  <CopyPlus size={16} />
                </button>
                <button className="icon-button danger" title="删除记录" onClick={() => remove(paper)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

