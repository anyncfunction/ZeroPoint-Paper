import type { Edition, Grade, QuestionType } from './schemas'

export interface EditionOption {
  value: Edition
  label: string
  version: string
}

export const EDITION_OPTIONS: EditionOption[] = [
  { value: 'renjiao', label: '人教版', version: '2024 新版' },
  { value: 'beishida', label: '北师大版', version: '2024 新版' },
  { value: 'suke', label: '苏科版', version: '2024 新版' }
]

export const GRADE_OPTIONS: Array<{ value: Grade; label: string }> = [
  { value: 7, label: '七年级' },
  { value: 8, label: '八年级' },
  { value: 9, label: '九年级' }
]

export const QUESTION_TYPE_OPTIONS: Array<{
  value: QuestionType
  label: string
  short: string
}> = [
  { value: 'single_choice', label: '单选题', short: '单选' },
  { value: 'fill_blank', label: '填空题', short: '填空' },
  { value: 'calculation', label: '计算题', short: '计算' },
  { value: 'solution', label: '解答题', short: '解答' },
  { value: 'proof', label: '证明题', short: '证明' },
  { value: 'application', label: '应用题', short: '应用' }
]

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '入门',
  2: '很基础',
  3: '基础',
  4: '较易',
  5: '中等',
  6: '中等',
  7: '较难',
  8: '偏难',
  9: '中考难题',
  10: '中考压轴'
}

export const PROVIDER_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    reviewModel: 'gpt-4.1'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-flash',
    reviewModel: ''
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    reviewModel: 'qwen-max'
  },
  {
    id: 'custom',
    name: '自定义接口',
    baseUrl: 'http://localhost:11434/v1',
    model: 'local-model',
    reviewModel: ''
  }
] as const

export const GLOBAL_SAFETY_NOTE = 'AI 生成题目需教师审核后使用'

