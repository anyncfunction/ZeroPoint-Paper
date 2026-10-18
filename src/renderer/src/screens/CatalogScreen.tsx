import { useEffect, useState } from 'react'
import { BookMarked, CheckCircle2 } from 'lucide-react'
import type { Chapter, Edition, Grade } from '../../../shared/schemas'
import { EDITION_OPTIONS, GRADE_OPTIONS } from '../../../shared/constants'
import { chapterDisplayName } from '../../../shared/curriculum'

export function CatalogScreen() {
  const [edition, setEdition] = useState<Edition>('renjiao')
  const [grade, setGrade] = useState<Grade>(7)
  const [chapters, setChapters] = useState<Chapter[]>([])

  useEffect(() => {
    void window.chujuan.listChapters(edition, grade).then(setChapters)
  }, [edition, grade])

  return (
    <div className="screen catalog-screen">
      <header className="screen-heading">
        <div>
          <p className="eyebrow">2024 新版 · 初中数学</p>
          <h1>教材目录</h1>
          <p>当前内置人教版、北师大版、苏科版七至九年级章节与知识点。</p>
        </div>
        <div className="catalog-verified">
          <CheckCircle2 size={16} />
          <span>三套目录已内置</span>
        </div>
      </header>

      <div className="catalog-filters">
        <div className="segmented">
          {EDITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={edition === option.value ? 'selected' : ''}
              onClick={() => setEdition(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="segmented compact-segmented">
          {GRADE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={grade === option.value ? 'selected' : ''}
              onClick={() => setGrade(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-grid">
        {(['上册', '下册'] as const).map((volume) => {
          const volumeChapters = chapters.filter((chapter) => chapter.volume === volume)
          return (
            <section className="volume-panel" key={volume}>
              <header>
                <BookMarked size={18} />
                <div>
                  <small>{EDITION_OPTIONS.find((item) => item.value === edition)?.label} · 2024</small>
                  <h2>{GRADE_OPTIONS.find((item) => item.value === grade)?.label}{volume}</h2>
                </div>
                <span>{volumeChapters.length} 章</span>
              </header>
              <div className="catalog-chapter-list">
                {volumeChapters.map((chapter) => (
                  <div className="catalog-chapter" key={chapter.id}>
                    <span className="catalog-number">{String(chapter.chapterNumber).padStart(2, '0')}</span>
                    <div>
                      <strong>{chapter.title}</strong>
                      <p>{chapter.knowledgePoints.join(' · ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

