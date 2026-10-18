import { useEffect, useMemo, useState } from 'react'
import {
  BookMarked,
  Copy,
  Download,
  Filter,
  Search,
  Star,
  StarOff,
  Ban,
  RotateCcw,
  X
} from 'lucide-react'
import type {
  Grade,
  QuestionBankEntry,
  QuestionType
} from '../../../shared/schemas'
import {
  EDITION_LABELS,
  GRADE_LABELS
} from '../../../shared/schemas'
import { QUESTION_TYPE_OPTIONS } from '../../../shared/constants'
import { RichText } from '../components/RichText'
import { FigurePreview } from '../components/FigurePreview'
import { errorMessage } from '../lib/utils'

export function QuestionBankScreen({ revision }: { revision: number }) {
  const [entries, setEntries] = useState<QuestionBankEntry[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<QuestionType | 'all'>('all')
  const [grade, setGrade] = useState<Grade | 'all'>('all')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [selected, setSelected] = useState<QuestionBankEntry | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void window.chujuan
      .listQuestionBank()
      .then(setEntries)
      .catch((nextError) => setError(errorMessage(nextError)))
      .finally(() => setLoading(false))
  }, [revision])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (!showExcluded && entry.excluded) return false
      if (favoriteOnly && !entry.favorite) return false
      if (grade !== 'all' && entry.grade !== grade) return false
      if (type !== 'all' && entry.question.type !== type) return false
      if (!keyword) return true
      return (
        entry.question.stem.toLowerCase().includes(keyword) ||
        entry.paperTitle.toLowerCase().includes(keyword) ||
        entry.chapterTitle.toLowerCase().includes(keyword)
      )
    })
  }, [entries, query, type, grade, favoriteOnly, showExcluded])

  const updateEntry = async (
    entry: QuestionBankEntry,
    patch: { favorite?: boolean; excluded?: boolean }
  ): Promise<void> => {
    try {
      await window.chujuan.updateQuestionBank({ id: entry.id, ...patch })
      setEntries((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, ...patch } : item))
      )
      setSelected((current) =>
        current && current.id === entry.id ? { ...current, ...patch } : current
      )
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  const exportBank = async (): Promise<void> => {
    try {
      const target = await window.chujuan.exportQuestionBank()
      if (target) setError('')
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }

  const copyStem = async (): Promise<void> => {
    if (!selected) return
    await navigator.clipboard.writeText(selected.question.stem).catch(() => undefined)
  }

  return (
    <div className="screen question-bank-screen">
      <header className="screen-heading">
        <div>
          <p className="eyebrow">本地题库</p>
          <h1>已经出过的题目</h1>
          <p>从本地试卷库自动收录。新建试卷时勾选“跨卷去重”即可避开这些题干。</p>
        </div>
        <div className="bank-count">
          <BookMarked size={17} />
          <strong>{entries.length}</strong>
          <span>道唯一题</span>
        </div>
      </header>

      <div className="library-toolbar bank-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            placeholder="搜索题干、章节或来源试卷"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="segmented bank-type-filter">
          <button
            className={type === 'all' ? 'selected' : ''}
            onClick={() => setType('all')}
          >
            全部
          </button>
          {QUESTION_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={type === option.value ? 'selected' : ''}
              onClick={() => setType(option.value)}
            >
              {option.short}
            </button>
          ))}
        </div>
        <div className="segmented compact-segments grade-filter">
          <button className={grade === 'all' ? 'selected' : ''} onClick={() => setGrade('all')}>
            全部年级
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
        <button
          className={favoriteOnly ? 'chip-toggle active' : 'chip-toggle'}
          onClick={() => setFavoriteOnly((value) => !value)}
        >
          <Star size={14} />
          只看收藏
        </button>
        <button
          className={showExcluded ? 'chip-toggle active' : 'chip-toggle'}
          onClick={() => setShowExcluded((value) => !value)}
        >
          <Ban size={14} />
          显示已排除
        </button>
        <button className="secondary-button compact-button" onClick={exportBank}>
          <Download size={15} />
          导出题库
        </button>
      </div>

      {error && <div className="error-bar compact"><span>{error}</span></div>}

      {loading ? (
        <div className="empty-state"><span className="loading-line" />正在整理本地题库</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark"><Filter size={22} /></div>
          <h2>{entries.length === 0 ? '题库还是空的' : '没有匹配的题目'}</h2>
          <p>{entries.length === 0 ? '生成一份试卷后，题目会自动进入本地题库。' : '换个关键词或题型试试。'}</p>
        </div>
      ) : (
        <div className={`bank-layout ${selected ? 'with-detail' : ''}`}>
          <div className="bank-list">
            {filtered.map((entry) => (
              <button
                className={selected?.id === entry.id ? 'bank-row selected' : 'bank-row'}
                key={entry.id}
                onClick={() => setSelected(entry)}
              >
                <span className="bank-type">{QUESTION_TYPE_OPTIONS.find((item) => item.value === entry.question.type)?.short}</span>
                <span className="bank-stem"><RichText text={entry.question.stem} /></span>
                <span className="bank-meta">
                  {GRADE_LABELS[entry.grade]} · {EDITION_LABELS[entry.edition]}
                  <small>{entry.chapterTitle}</small>
                </span>
                <span className="bank-difficulty">{entry.question.difficulty}/10</span>
                {entry.occurrences > 1 && <span className="bank-reuse">×{entry.occurrences}</span>}
                {entry.favorite && <span className="bank-favorite"><Star size={12} /></span>}
                {entry.excluded && <span className="bank-excluded">已排除</span>}
              </button>
            ))}
          </div>

          {selected && (
            <aside className="bank-detail">
              <div className="bank-detail-head">
                <div>
                  <span className="section-kicker">题目详情</span>
                  <h2>{QUESTION_TYPE_OPTIONS.find((item) => item.value === selected.question.type)?.label}</h2>
                </div>
                <button className="icon-button" onClick={() => setSelected(null)} title="关闭详情">
                  <X size={17} />
                </button>
              </div>
              <div className="bank-detail-stem">
                <RichText text={selected.question.stem} />
              </div>
              {selected.question.options.length > 0 && (
                <div className="bank-options">
                  {selected.question.options.map((option) => (
                    <div key={option.key}>
                      <strong>{option.key}.</strong>
                      <RichText text={option.text} />
                    </div>
                  ))}
                </div>
              )}
              {selected.question.figure && <FigurePreview figure={selected.question.figure} compact />}
              <div className="bank-answer">
                <span>答案</span>
                <RichText text={selected.question.answer} />
              </div>
              <div className="bank-explanation">
                <span>解析</span>
                <RichText text={selected.question.explanation} />
              </div>
              <div className="bank-source">
                <span>来源：{selected.paperTitle}</span>
                <span>收录 {selected.occurrences} 次</span>
              </div>
              <div className="bank-detail-actions">
                <button
                  className={selected.favorite ? 'secondary-button active-soft' : 'secondary-button'}
                  onClick={() => updateEntry(selected, { favorite: !selected.favorite })}
                >
                  {selected.favorite ? <StarOff size={15} /> : <Star size={15} />}
                  {selected.favorite ? '取消收藏' : '收藏'}
                </button>
                <button
                  className={selected.excluded ? 'secondary-button active-soft' : 'secondary-button'}
                  onClick={() => updateEntry(selected, { excluded: !selected.excluded })}
                >
                  {selected.excluded ? <RotateCcw size={15} /> : <Ban size={15} />}
                  {selected.excluded ? '恢复查重' : '排除查重'}
                </button>
              </div>
              <button className="secondary-button full-button" onClick={copyStem}>
                <Copy size={15} />
                复制题干
              </button>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

