import {
  EDITION_LABELS,
  GRADE_LABELS,
  QUESTION_TYPE_LABELS,
  type ExamConfig,
  type ExamPlanSection,
  type Question,
  type QuestionType
} from '../../shared/schemas'
import { chapterDisplayName, getSelectedChapters } from '../../shared/curriculum'

function difficultyGuide(level: number): string {
  if (level <= 2) return '基础识记与直接套用，步骤短，数据简单'
  if (level <= 4) return '基础理解与常规运算，需要一至两步'
  if (level <= 6) return '常规综合应用，需要多步推理但不超过课本常见例题难度'
  if (level === 7) return '较难综合题，需要两步以上推理，允许设置一个关键易错点'
  if (level === 8) return '拔高题，需要三步以上推理，至少综合两个知识点'
  if (level === 9) return '接近中考数学倒数第三、四道难题，需要多步转化、逆向推理或分类讨论'
  return '中考数学最后两道压轴题难度，必须包含深层结构、综合方法和完整多步推理'
}

function difficultyContract(level: number): string {
  if (level <= 7) return ''
  if (level === 8) {
    return `【拔高难度硬性要求】
- 每题至少需要 3 个有效推理步骤，至少综合 2 个知识点。
- 单选题不能靠直接代入或一步计算选出；错误选项必须对应真实易错点。
- 填空、计算和解答题必须经过至少两次变形或转化。
- 答案解析按“步骤 1、步骤 2、步骤 3”写出关键推理，不得只给结果。
- 生成后自查：若某题看一眼就能确定思路，必须改写成多步综合题。`
  }
  if (level === 9) {
    return `【高难综合硬性要求】
- 难度 9 的题至少需要 4 个有效推理步骤，必须综合多个知识点，而不是只换复杂数字。
- 至少一半题目包含以下一种结构：逆向推理、分类讨论、参数关系、构造辅助线、函数图像与代数结合、实际情境建模。
- 单选和填空题也必须设置中间转化，不能直接套公式得到答案。
- 解题过程必须出现一个关键判断点；解析中明确写出该判断依据。
- 禁止使用“直接计算”“观察可得”等降低难度的提示。`
  }
  return `【中考压轴题硬性要求】
- 标注难度 10 的题按中考数学试卷最后 1–2 道压轴题标准，不得退化成校内常规综合题或只增加计算量。
- 压轴题至少需要 6–10 分钟完成；标注难度 9 的题也要达到中考倒数几道难题的强度。
- 难度 10 的题至少需要 5 个有效推理步骤，必须综合至少 2 个知识点，并包含至少一个关键转折：隐藏条件转化、分类讨论、辅助线构造、参数范围、函数与几何综合、动点或最值判断。
- 单选题不能直接代入；选项要覆盖典型的概念错误、边界条件漏判或推理中断结果。
- 填空题至少要经过两次中间转化；计算、解答、证明题至少要有 4 个可评分步骤。
- 应用题必须完成建模、求解、范围或合理性检验中的至少三个环节。
- 题干条件要充分但不要解释解法，不得暗示使用哪个定理。
- 写题后先自查：难度 10 的题如果优秀学生能在 1–2 分钟内完成，必须重写为中考压轴结构；解析少于 5 个关键步骤，必须增强条件联系或设问层次。
- 严格使用初中知识和中考常见方法，不引入高中知识，也不使用偏门竞赛技巧。`
}

const FIGURE_GUIDE = `
配图只能使用以下模板，不得输出 SVG、HTML 或图片链接：
- number_line: params { min, max, ticks }
- coordinate_plane: params { xMin, xMax, yMin, yMax }
- function_curve: params { xMin, xMax, curve: "linear"|"quadratic"|"inverse", a, b, c? }
- triangle: params { kind: "general"|"right"|"isosceles"|"equilateral" }；仅限没有额外点、交点或辅助线的三顶点三角形
- quadrilateral: params { kind: "general"|"parallelogram"|"rectangle"|"rhombus"|"trapezoid" }；仅限没有额外点、交点或辅助线的四顶点四边形
- circle: params { showRadius: true|false, showDiameter: true|false }
- angle: params { degrees }
- custom_geometry: geometry { points, segments, rightAngles?, annotations? }；params 可省略

custom_geometry 示例：
{"template":"custom_geometry","geometry":{"points":[{"id":"A","label":"A","x":12,"y":18},{"id":"B","label":"B","x":82,"y":18},{"id":"C","label":"C","x":48,"y":88},{"id":"D","label":"D","x":62,"y":16}],"segments":[{"from":"A","to":"B"},{"from":"B","to":"C"},{"from":"C","to":"A"},{"from":"C","to":"D","dashed":true}],"rightAngles":[{"vertex":"A","from":"B","to":"C"}],"annotations":[{"x":55,"y":27,"text":"2:3"}]}}
坐标范围均为 0–100，x 向右增大，y 向上增大。所有点坐标必须分散，不能重叠。

配图规则：
- 题干中所有被标出的点都必须出现在配图中，线段、交点、辅助线、垂直关系和比例标注必须与题干一致。
- 出现中点、交点、垂足、折叠点、动点、辅助线或比例关系时，必须使用 custom_geometry，禁止用简化的 triangle 或 quadrilateral 代替。
- 数轴、坐标系和函数图必须与题干数值和所问内容直接相关；题干没有“如图/图像/坐标系”等需要时，不要硬加配图。
- 若无法可靠画出与题干完全一致的图，则省略 figure，不要绘制误导性示意图。
- 若题目不真正需要配图，figure 必须省略。
`.trim()

const ALGEBRA_FIGURE_GUIDE = `
配图只能使用以下模板，不得输出 SVG、HTML 或图片链接：
- number_line: params { min, max, ticks }
- coordinate_plane: params { xMin, xMax, yMin, yMax }
- function_curve: params { xMin, xMax, curve: "linear"|"quadratic"|"inverse", a, b, c? }

配图规则：
- 只有题干出现数轴、坐标系、函数图像等需要时才配图，不要硬加无关图形。
- 数轴、坐标系和函数图必须与题干数值和所问内容直接相关。
- 若无法可靠画出与题干完全一致的图，则省略 figure。
`.trim()

function isGeometryContext(
  chapters: ReturnType<typeof getSelectedChapters>,
  type: QuestionType
): boolean {
  if (type === 'proof') return true
  return chapters.some((chapter) =>
    /三角形|全等|四边形|圆|相似|图形|勾股|旋转|轴对称|平行线|角/.test(
      `${chapter.title} ${chapter.knowledgePoints.join(' ')}`
    )
  )
}

function figureGuideFor(
  chapters: ReturnType<typeof getSelectedChapters>,
  type: QuestionType
): string {
  return isGeometryContext(chapters, type) ? FIGURE_GUIDE : ALGEBRA_FIGURE_GUIDE
}

export function systemPrompt(
  reasoningEffort: 'low' | 'medium' | 'high' = 'medium'
): string {
  const thinkingGuide = {
    low: '思考强度：低。优先快速完成命题，只做必要的条件与答案检查。',
    medium: '思考强度：中。命题前先拆解章节知识点、难度目标和推理步骤，再完成条件与答案检查。',
    high: '思考强度：高。命题前后都要进行完整难度审查，重点检查多步推理、边界条件、分类讨论和答案一致性。'
  }[reasoningEffort]
  return `你是中国初中数学中考命题教师。你必须原创命题，不得复制教材或网络原题。
题目必须严格符合指定年级、教材章节和初中数学课程标准，条件充分，答案唯一或可明确评分。
所有公式用 LaTeX 写在 $...$ 中，不使用 Markdown 表格、HTML 或代码块。
难度必须体现在条件关系、推理链和知识综合上，不能只靠增大数字、堆叠计算或文字变长。
当目标难度为 9–10 时，必须按中考数学最后几道难题和最后两道压轴题的标准命题，不得引入高中知识或偏门竞赛技巧。
${thinkingGuide}
每道题必须有完整答案解析，解析要与题干条件一致。只输出合法 JSON。`
}

export function sectionPrompt(
  config: ExamConfig,
  section: ExamPlanSection,
  difficulties: number[]
): string {
  const selected = getSelectedChapters(config.chapterIds)
  const sectionChapterIds = [...new Set(section.chapterIds)]
  const scoped = selected.filter((chapter) => sectionChapterIds.includes(chapter.id))
  const chapters = scoped.length > 0 ? scoped : selected
  const chapterLines = chapters
    .map(
      (chapter) =>
        `- ${chapter.id}: ${chapterDisplayName(chapter)}；知识点：${chapter.knowledgePoints.join('、')}`
    )
    .join('\n')
  const slots = difficulties
    .map((difficulty, index) => {
      const chapterId = section.chapterIds[index] ?? chapters[index % chapters.length]?.id
      return `${index + 1}. 章节ID ${chapterId}，难度 ${difficulty}/10`
    })
    .join('\n')
  const capstoneLevel = config.difficulty >= 9 ? 10 : 9
  const capstoneSlots = difficulties.filter((difficulty) => difficulty === capstoneLevel).length
  const capstoneGuide =
    config.difficulty >= 8
      ? capstoneSlots > 0
        ? `【最高难度题分配】本节有 ${capstoneSlots} 道难度 ${capstoneLevel} 的题，按${capstoneLevel === 10 ? '中考最后两道压轴题' : '多步拔高综合题'}标准命制；其余题目按槽位难度执行。`
        : `【最高难度题分配】本节不含难度 ${capstoneLevel} 的题，按槽位标注的难度执行，不得擅自抬高难度。`
      : ''

  return `请生成一份${GRADE_LABELS[config.grade]}数学试卷中的“${QUESTION_TYPE_LABELS[section.type]}”部分。
教材版本：${EDITION_LABELS[config.edition]} 2024 新版
允许章节：
${chapterLines}
题型：${section.type}
题目数量：${section.questionCount}
题目槽位及难度分配：
${slots}
整体难度：${config.difficulty}/10，${difficultyGuide(config.difficulty)}
计算量：${config.calculationLoad}/5；思维量：${config.thinkingLoad}/5。
${difficultyContract(config.difficulty)}
${capstoneGuide}
教师备注：${config.notes || '无'}

${figureGuideFor(chapters, section.type)}

返回结构：
{
  "items": [
    {
      "slot": 1,
      "chapterId": "章节ID",
      "knowledgePoint": "具体知识点",
      "difficulty": 6,
      "stem": "题干，公式用 $...$",
      "options": [{"key":"A","text":"..."}],
      "answer": "答案；单选只填选项字母",
      "explanation": "分步解析",
      "figure": {"template":"triangle","params":{"kind":"right"}}
    }
  ]
}

规则：
- items 数量必须恰好为 ${section.questionCount}，slot 从 1 连续编号。
- 单选题必须恰好 4 个选项且只有一个正确；其他题型 options 必须为 []。
- 每题都遵循对应槽位的章节与难度。
- 不同题目的情境、数据和设问不得重复。
- 答案页是独立文件，题干中不要写“答案见后”。
- 只输出 JSON。`
}

export function repairPrompt(
  config: ExamConfig,
  section: ExamPlanSection,
  raw: string,
  errors: string
): string {
  return `${sectionPrompt(config, section, section.difficulties)}

上一次输出未通过校验，错误如下：
${errors}

上一次输出：
${raw.slice(0, 12_000)}

请修正并重新输出完整 JSON，不要解释。`
}

export function questionRegeneratePrompt(
  config: ExamConfig,
  expectedType: QuestionType,
  difficulty: number,
  chapterId: string,
  oldQuestion: Question
): string {
  const chapter = getSelectedChapters([chapterId])[0]
  return `重新命制一道${GRADE_LABELS[config.grade]}数学${QUESTION_TYPE_LABELS[expectedType]}。
教材：${EDITION_LABELS[config.edition]} 2024 新版
章节：${chapter ? chapterDisplayName(chapter) : chapterId}
知识点：${oldQuestion.knowledgePoint}
难度：${difficulty}/10
${difficultyGuide(difficulty)}
${difficultyContract(difficulty)}
不得与原题重复：
${oldQuestion.stem}

${figureGuideFor(chapter ? [chapter] : [], expectedType)}

返回与以下结构相同的单个 JSON 对象，不要数组、不要解释：
{"chapterId":"${chapterId}","knowledgePoint":"知识点","difficulty":${difficulty},"stem":"题干","options":[],"answer":"答案","explanation":"解析"}
`
}

export function hardenSectionPrompt(
  config: ExamConfig,
  section: ExamPlanSection,
  items: unknown[]
): string {
  return `你是中考数学压轴题命题审校员。请对下面整组题目做第二轮强制拔高。

年级：${GRADE_LABELS[config.grade]}
教材：${EDITION_LABELS[config.edition]} 2024 新版
章节 ID：${section.chapterIds.join('、')}
题型：${QUESTION_TYPE_LABELS[section.type]}
目标难度：${config.difficulty}/10
试卷标题：${config.title}
教师备注：${config.notes || '无'}

原始题目：
${JSON.stringify(items, null, 2)}

审查标准：
- 以优秀初中生为参照。标注难度 10 的题若预期 1–2 分钟内能完成，原作不合格，必须重写。
- 难度 10 的标准是中考数学最后两道压轴题：压轴题应需 6–10 分钟；难度 9 的题需 3–6 分钟。
- 标注难度 10 的题必须发生实质结构升级，不能只改数字；难度 9 的题只做必要的条件与解析强化。
- 可通过增加条件间的隐含联系、逆向设问、分类讨论、参数范围、辅助线、函数与几何综合、动点、最值或实际建模来拔高。
- 只使用初中数学与中考常见方法，不得使用高中知识或偏门竞赛技巧。
- 所有题目仍必须条件充分、答案明确，解析至少给出 4 个关键推理步骤。
- 单选题不能直接代入；错误选项必须对应真实推理错误。
- 保持原题数量、章节和题型，不得删题、加题或改变题号。

${figureGuideFor(getSelectedChapters(section.chapterIds), section.type)}

只返回需要实质拔高的题目，不需要返回未修改的题。为降低输出成本，使用 upgrades 格式：
{"upgrades":[{"slot":1,"reason":"为何原题太简单","stem":"拔高后的题干","options":[],"answer":"答案","explanation":"逐步解析","figure":null}]}
未列出的字段沿用原题；若所有题都已达标，返回 {"upgrades":[]}。只输出 JSON。`
}

export function verifySectionPrompt(
  config: ExamConfig,
  section: ExamPlanSection,
  items: unknown[]
): string {
  return `你是独立数学解题与审校员。不要信任下面题目中的答案，必须逐题重新求解。

年级：${GRADE_LABELS[config.grade]}
教材：${EDITION_LABELS[config.edition]} 2024 新版
允许章节：${section.chapterIds.join('、')}
题型：${QUESTION_TYPE_LABELS[section.type]}
题目数量：${section.questionCount}

待审题目：
${JSON.stringify(items, null, 2)}

逐题检查：
1. 条件是否充分、是否互相矛盾、是否超出所选章节。
2. 从零独立求解，检查所有解、边界值、分类情况和单位。
3. 比对原答案，检查选项、答案和解析是否一致。
4. 检查是否存在歧义、多解漏解、图形与题干不一致。
5. 若题目错误、过弱或答案解析有误，直接改写成可评分且难度不降低的正确题目。
6. 若原题正确，可以保留题干，但必须把解析整理为清晰的逐步过程。

只返回需要修改的字段，避免重复输出正确题目：
{"corrections":[{"slot":1,"reason":"发现的问题","answer":"修正答案","explanation":"完整修正解析"}]}
- 未修改的字段自动沿用原题。
- 若选项需要调整，在 correction 中提供完整 options。
- 若题干本身有歧义或条件错误，提供新的 stem。
- 所有题都正确时，返回 {"corrections":[]}。
- 只输出 JSON，不要解释。`
}

