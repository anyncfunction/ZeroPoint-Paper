import { z } from 'zod'

export const GRADE_LABELS = {
  7: '七年级',
  8: '八年级',
  9: '九年级'
} as const

export const EDITION_LABELS = {
  renjiao: '人教版',
  beishida: '北师大版',
  suke: '苏科版'
} as const

export const QUESTION_TYPE_LABELS = {
  single_choice: '单选题',
  fill_blank: '填空题',
  calculation: '计算题',
  solution: '解答题',
  proof: '证明题',
  application: '应用题'
} as const

export const gradeSchema = z.union([z.literal(7), z.literal(8), z.literal(9)])
export const editionSchema = z.enum(['renjiao', 'beishida', 'suke'])
export const questionTypeSchema = z.enum([
  'single_choice',
  'fill_blank',
  'calculation',
  'solution',
  'proof',
  'application'
])
export const exportFormatSchema = z.enum(['pdf', 'docx'])

export const chapterSchema = z.object({
  id: z.string().min(1),
  edition: editionSchema,
  grade: gradeSchema,
  volume: z.enum(['上册', '下册']),
  chapterNumber: z.number().int().positive(),
  title: z.string().min(1),
  knowledgePoints: z.array(z.string()).default([])
})

export const figureTemplateSchema = z.enum([
  'number_line',
  'coordinate_plane',
  'function_curve',
  'triangle',
  'quadrilateral',
  'circle',
  'angle',
  'custom_geometry'
])

export const geometryPointSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9']{0,5}$/),
  label: z.string().min(1).max(8),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100)
})

export const geometrySegmentSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  dashed: z.boolean().default(false)
})

export const geometryRightAngleSchema = z.object({
  vertex: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1)
})

export const geometryAnnotationSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  text: z.string().min(1).max(24)
})

export const geometryFigureSchema = z.object({
  points: z.array(geometryPointSchema).min(3).max(24),
  segments: z.array(geometrySegmentSchema).min(2).max(60),
  rightAngles: z.preprocess(
    (value) => value ?? [],
    z.array(geometryRightAngleSchema).max(12).default([])
  ),
  annotations: z.preprocess(
    (value) => value ?? [],
    z.array(geometryAnnotationSchema).max(12).default([])
  )
})

export const figureSpecSchema = z.object({
  template: figureTemplateSchema,
  params: z.preprocess(
    (value) => value ?? {},
    z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]))
  ),
  caption: z.string().max(120).optional(),
  geometry: geometryFigureSchema.optional()
}).superRefine((figure, ctx) => {
  if (figure.template === 'custom_geometry' && !figure.geometry) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['geometry'],
      message: '自定义几何图必须提供点、线段和坐标'
    })
  }
  if (figure.geometry) {
    const pointIds = new Set(figure.geometry.points.map((point) => point.id))
    if (pointIds.size !== figure.geometry.points.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['geometry', 'points'],
        message: '几何图中的点编号不能重复'
      })
    }
    for (const segment of figure.geometry.segments) {
      if (!pointIds.has(segment.from) || !pointIds.has(segment.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['geometry', 'segments'],
          message: `线段 ${segment.from}${segment.to} 引用了不存在的点`
        })
      }
    }
  }
})

export const examConfigSchema = z.object({
  grade: gradeSchema,
  edition: editionSchema,
  chapterIds: z.array(z.string()).min(1, '至少选择一章'),
  pageCount: z.number().int().min(1).max(16),
  difficulty: z.number().int().min(1).max(10),
  typeCount: z.number().int().min(1).max(6),
  types: z.array(questionTypeSchema).max(6).default([]),
  manualCounts: z.record(z.number().int().min(1).max(50)).default({}),
  totalScore: z.number().int().min(10).max(300),
  durationMinutes: z.number().int().min(10).max(300),
  capstoneCount: z.number().int().min(0).max(8).default(2),
  calculationLoad: z.number().int().min(1).max(5).default(3),
  thinkingLoad: z.number().int().min(1).max(5).default(3),
  answerSpace: z.enum(['compact', 'standard', 'loose']).default('standard'),
  includeAnswerSheet: z.boolean().default(true),
  title: z.string().trim().min(1, '请填写标题').max(60),
  exportFormats: z.array(exportFormatSchema).min(1),
  notes: z.string().trim().max(500).default(''),
  avoidCrossPaperDuplicates: z.boolean().default(false)
})

export const optionSchema = z.object({
  key: z.string().regex(/^[A-F]$/),
  text: z.string().min(1)
})

export const questionSchema = z
  .object({
    id: z.string().min(1),
    type: questionTypeSchema,
    chapterId: z.string().min(1),
    knowledgePoint: z.string().min(1),
    difficulty: z.number().int().min(1).max(10),
    stem: z.string().min(2),
    options: z.array(optionSchema).default([]),
    answer: z.string().min(1),
    explanation: z.string().min(1),
    figure: figureSpecSchema.optional(),
    score: z.number().int().positive()
  })
  .superRefine((question, ctx) => {
    if (question.type === 'single_choice' && question.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: '单选题至少需要两个选项'
      })
    }

    if (question.type !== 'single_choice' && question.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: '非单选题不应包含选项'
      })
    }
  })

export const paperSectionSchema = z.object({
  id: z.string().min(1),
  type: questionTypeSchema,
  title: z.string().min(1),
  instructions: z.string().min(1),
  questions: z.array(questionSchema)
})

export const questionBankEntrySchema = z.object({
  id: z.string(),
  paperId: z.string(),
  paperTitle: z.string(),
  question: questionSchema,
  grade: gradeSchema,
  edition: editionSchema,
  chapterTitle: z.string(),
  createdAt: z.string(),
  occurrences: z.number().int().positive().default(1),
  favorite: z.boolean().default(false),
  excluded: z.boolean().default(false)
})

export const questionBankStateSchema = z.object({
  favorites: z.array(z.string()).default([]),
  excluded: z.array(z.string()).default([])
})

export type QuestionBankState = z.infer<typeof questionBankStateSchema>

export const questionBankUpdateSchema = z.object({
  id: z.string().min(1),
  favorite: z.boolean().optional(),
  excluded: z.boolean().optional()
})

export const examPlanSectionSchema = z.object({
  type: questionTypeSchema,
  title: z.string(),
  questionCount: z.number().int().positive(),
  scorePerQuestion: z.number().int().positive(),
  chapterIds: z.array(z.string()),
  difficulties: z.array(z.number().int().min(1).max(10))
})

export const examPlanSchema = z.object({
  sections: z.array(examPlanSectionSchema).min(1),
  totalQuestions: z.number().int().positive(),
  totalScore: z.number().int().positive(),
  estimatedMinutes: z.number().int().positive(),
  warnings: z.array(z.string()).default([])
})

export const paperSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  config: examConfigSchema,
  plan: examPlanSchema,
  sections: z.array(paperSectionSchema).min(1),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      requests: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative().optional()
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export const providerProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  baseUrl: z
    .string()
    .url('请输入有效接口地址')
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: '接口地址必须以 http:// 或 https:// 开头'
    }),
  model: z.string().min(1).max(100),
  reviewModel: z.string().max(100).optional(),
  authMode: z.enum(['user-key', 'managed']).default('user-key'),
  timeoutMs: z.number().int().min(10_000).max(180_000).default(90_000),
  concurrency: z.number().int().min(1).max(3).default(3),
  reasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  answerReview: z.boolean().default(true),
  monthlyTokenBudget: z.number().int().min(0).max(1_000_000_000).default(0),
  inputPricePerM: z.number().min(0).max(10_000).default(0),
  outputPricePerM: z.number().min(0).max(10_000).default(0),
  hasApiKey: z.boolean().optional()
})

export const providerSaveSchema = z.object({
  profile: providerProfileSchema.omit({ hasApiKey: true }),
  apiKey: z.string().max(500).optional()
})

export const providerTestSchema = z.object({
  profile: providerProfileSchema.omit({ hasApiKey: true }),
  apiKey: z.string().max(500).optional()
})

export const providerPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  reviewModel: z.string().optional()
})

export const progressEventSchema = z.object({
  paperId: z.string().optional(),
  stage: z.enum([
    'preparing',
    'generating',
    'validating',
    'typesetting',
    'saving',
    'done',
    'error'
  ]),
  message: z.string(),
  current: z.number().optional(),
  total: z.number().optional()
})

export const paperSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  grade: gradeSchema,
  edition: editionSchema,
  pageCount: z.number(),
  difficulty: z.number(),
  questionCount: z.number(),
  totalTokens: z.number().optional(),
  estimatedCost: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  outputFolder: z.string().optional()
})

export const libraryRecordSchema = z.object({
  paper: paperSchema,
  outputFolder: z.string().optional(),
  exportedFiles: z.array(z.string()).default([])
})

export type Grade = z.infer<typeof gradeSchema>
export type Edition = z.infer<typeof editionSchema>
export type QuestionType = z.infer<typeof questionTypeSchema>
export type ExportFormat = z.infer<typeof exportFormatSchema>
export type Chapter = z.infer<typeof chapterSchema>
export type FigureSpec = z.infer<typeof figureSpecSchema>
export type ExamConfig = z.infer<typeof examConfigSchema>
export type Question = z.infer<typeof questionSchema>
export type PaperSection = z.infer<typeof paperSectionSchema>
export type ExamPlanSection = z.infer<typeof examPlanSectionSchema>
export type ExamPlan = z.infer<typeof examPlanSchema>
export type Paper = z.infer<typeof paperSchema>
export type ProviderProfile = z.infer<typeof providerProfileSchema>
export type ProviderSaveInput = z.infer<typeof providerSaveSchema>
export type ProviderTestInput = z.infer<typeof providerTestSchema>
export type ProgressEvent = z.infer<typeof progressEventSchema>
export type PaperSummary = z.infer<typeof paperSummarySchema>
export type LibraryRecord = z.infer<typeof libraryRecordSchema>
export type QuestionBankEntry = z.infer<typeof questionBankEntrySchema>
export type QuestionBankUpdate = z.infer<typeof questionBankUpdateSchema>

export const tokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  requests: z.number().int().nonnegative().default(0)
})

export type TokenUsage = z.infer<typeof tokenUsageSchema>

export const usageSummarySchema = z.object({
  month: z.string(),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  requests: z.number().int().nonnegative().default(0),
  estimatedCost: z.number().nonnegative().default(0),
  budget: z.number().int().nonnegative().default(0)
})

export type UsageSummary = z.infer<typeof usageSummarySchema>

export interface ExportResult {
  outputFolder: string
  files: string[]
}

export interface ConnectionResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export interface SettingsSnapshot {
  profile: ProviderProfile
  presets: Array<z.infer<typeof providerPresetSchema>>
  usage: UsageSummary
}

export interface AppInfo {
  version: string
  dataDirectory: string
  defaultOutputDirectory: string
}

