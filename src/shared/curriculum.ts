import type { Chapter, Edition, Grade } from './schemas'

interface VolumeSource {
  volume: '上册' | '下册'
  chapters: string[]
}

type EditionSource = Record<Grade, VolumeSource[]>

const SOURCES: Record<Edition, EditionSource> = {
  renjiao: {
    7: [
      {
        volume: '上册',
        chapters: [
          '有理数',
          '有理数的运算',
          '代数式',
          '整式的加减',
          '一元一次方程',
          '几何图形初步'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '相交线与平行线',
          '实数',
          '平面直角坐标系',
          '二元一次方程组',
          '不等式与不等式组',
          '数据的收集、整理与描述'
        ]
      }
    ],
    8: [
      {
        volume: '上册',
        chapters: [
          '三角形',
          '全等三角形',
          '轴对称',
          '整式的乘法与因式分解',
          '分式'
        ]
      },
      {
        volume: '下册',
        chapters: ['二次根式', '勾股定理', '平行四边形', '一次函数', '数据的分析']
      }
    ],
    9: [
      {
        volume: '上册',
        chapters: ['一元二次方程', '二次函数', '旋转', '圆', '概率初步']
      },
      {
        volume: '下册',
        chapters: ['反比例函数', '相似', '锐角三角函数', '投影与视图']
      }
    ]
  },
  beishida: {
    7: [
      {
        volume: '上册',
        chapters: [
          '丰富的图形世界',
          '有理数及其运算',
          '整式及其加减',
          '基本平面图形',
          '一元一次方程',
          '数据的收集与整理'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '整式的乘除',
          '相交线与平行线',
          '变量之间的关系',
          '三角形',
          '生活中的轴对称',
          '概率初步'
        ]
      }
    ],
    8: [
      {
        volume: '上册',
        chapters: [
          '勾股定理',
          '实数',
          '位置与坐标',
          '一次函数',
          '二元一次方程组',
          '数据的分析',
          '平行线的证明'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '三角形的证明',
          '一元一次不等式与一元一次不等式组',
          '图形的平移与旋转',
          '因式分解',
          '分式与分式方程',
          '平行四边形'
        ]
      }
    ],
    9: [
      {
        volume: '上册',
        chapters: [
          '特殊平行四边形',
          '一元二次方程',
          '概率的进一步认识',
          '图形的相似',
          '投影与视图',
          '反比例函数'
        ]
      },
      {
        volume: '下册',
        chapters: ['直角三角形的边角关系', '二次函数', '圆']
      }
    ]
  },
  suke: {
    7: [
      {
        volume: '上册',
        chapters: [
          '数学与我们同行',
          '有理数',
          '代数式',
          '一元一次方程',
          '走进图形世界',
          '平面图形的认识（一）'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '平面图形的认识（二）',
          '幂的运算',
          '整式乘法与因式分解',
          '二元一次方程组',
          '一元一次不等式',
          '证明'
        ]
      }
    ],
    8: [
      {
        volume: '上册',
        chapters: [
          '全等三角形',
          '轴对称图形',
          '勾股定理',
          '实数',
          '平面直角坐标系',
          '一次函数'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '数据的收集、整理、描述',
          '认识概率',
          '中心对称图形—平行四边形',
          '分式',
          '反比例函数',
          '二次根式'
        ]
      }
    ],
    9: [
      {
        volume: '上册',
        chapters: [
          '一元二次方程',
          '对称图形—圆',
          '数据的集中趋势和离散程度',
          '等可能条件下的概率'
        ]
      },
      {
        volume: '下册',
        chapters: [
          '二次函数',
          '图形的相似',
          '锐角三角函数',
          '统计与概率的简单应用'
        ]
      }
    ]
  }
}

function knowledgePoints(title: string): string[] {
  const mappings: Array<[RegExp, string[]]> = [
    [/有理数/, ['正数与负数', '数轴', '绝对值', '有理数运算']],
    [/代数式|整式/, ['代数式表示', '合并同类项', '整式运算', '因式分解']],
    [/方程/, ['方程建立', '解法', '实际应用']],
    [/不等式/, ['不等式性质', '解集', '实际应用']],
    [/三角形|全等/, ['三角形性质', '全等判定', '几何证明']],
    [/四边形|平行四边形/, ['四边形性质', '判定', '几何证明']],
    [/圆/, ['圆的性质', '圆周角', '切线与计算']],
    [/函数|坐标/, ['函数图像', '解析式', '性质与应用']],
    [/勾股/, ['勾股定理', '逆定理', '实际应用']],
    [/概率|数据/, ['数据整理', '统计分析', '概率计算']],
    [/相似|三角函数/, ['比例关系', '相似判定', '边长与角度计算']],
    [/图形|轴对称|旋转/, ['图形变换', '对称性质', '空间想象']],
    [/实数|根式/, ['实数运算', '平方根', '二次根式']]
  ]
  const matched = mappings.find(([pattern]) => pattern.test(title))
  return matched?.[1] ?? [title]
}

export const CHAPTER_CATALOG: Chapter[] = Object.entries(SOURCES).flatMap(
  ([edition, grades]) =>
    Object.entries(grades).flatMap(([gradeText, volumes]) =>
      volumes.flatMap((volume) =>
        volume.chapters.map((title, index) => ({
          id: `${edition}-${gradeText}-${volume.volume === '上册' ? 'a' : 'b'}-${index + 1}`,
          edition: edition as Edition,
          grade: Number(gradeText) as Grade,
          volume: volume.volume,
          chapterNumber: index + 1,
          title,
          knowledgePoints: knowledgePoints(title)
        }))
      )
    )
)

export function getChapters(edition: Edition, grade: Grade): Chapter[] {
  return CHAPTER_CATALOG.filter(
    (chapter) => chapter.edition === edition && chapter.grade === grade
  )
}

export function getSelectedChapters(chapterIds: string[]): Chapter[] {
  const selected = new Set(chapterIds)
  return CHAPTER_CATALOG.filter((chapter) => selected.has(chapter.id))
}

export function chapterDisplayName(chapter: Chapter): string {
  return `${chapter.volume} 第${chapter.chapterNumber}章 ${chapter.title}`
}

