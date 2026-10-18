import {
  EDITION_LABELS,
  GRADE_LABELS,
  type ExamPlan,
  type ProviderProfile,
  type QuestionType
} from '../../../shared/schemas'
import { DIFFICULTY_LABELS, QUESTION_TYPE_OPTIONS } from '../../../shared/constants'

export interface UsageEstimate {
  requests: number
  promptTokens: number
  completionTokens: number
  costLow: number | null
  costHigh: number | null
}

export function estimateGenerationUsage(
  plan: ExamPlan | null | undefined,
  difficulty: number,
  profile?: ProviderProfile | null
): UsageEstimate | null {
  if (!plan || plan.sections.length === 0) return null
  const sections = plan.sections.length
  const questions = Math.max(plan.totalQuestions, sections)
  const promptTokens = Math.round(1200 * sections + 220 * questions)
  const perQuestion = difficulty >= 8 ? 480 : 420
  let completionTokens = Math.round(questions * perQuestion)
  const reviewEnabled = profile?.answerReview ?? false
  if (reviewEnabled) completionTokens = Math.round(completionTokens * 1.35)
  const requests = sections + (reviewEnabled ? 1 : 0)

  const inputPrice = profile?.inputPricePerM ?? 0
  const outputPrice = profile?.outputPricePerM ?? 0
  let costLow: number | null = null
  let costHigh: number | null = null
  if (inputPrice > 0 || outputPrice > 0) {
    const base =
      (promptTokens / 1_000_000) * inputPrice +
      (completionTokens / 1_000_000) * outputPrice
    costLow = base * 0.75
    costHigh = base * 1.35
  }

  return { requests, promptTokens, completionTokens, costLow, costHigh }
}

export function gradeLabel(grade: 7 | 8 | 9): string {
  return GRADE_LABELS[grade]
}

export function editionLabel(edition: 'renjiao' | 'beishida' | 'suke'): string {
  return EDITION_LABELS[edition]
}

export function difficultyLabel(value: number): string {
  return DIFFICULTY_LABELS[value] ?? ''
}

export function suggestedTypes(count: number, chapterText: string): QuestionType[] {
  let types = QUESTION_TYPE_OPTIONS.map((type) => type.value)
  const isGeometry = /三角形|全等|四边形|圆|相似|图形|勾股/.test(chapterText)
  if (isGeometry) {
    types = ['single_choice', 'fill_blank', 'calculation', 'solution', 'proof', 'application']
  }
  return types.slice(0, count)
}

export function defaultTitle(grade: 7 | 8 | 9): string {
  return `${gradeLabel(grade)}数学阶段检测`
}

export function formatDate(value: string): string {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function isLocalEndpoint(baseUrl: string): boolean {
  return /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(baseUrl)
}

export function providerConfigured(profile?: {
  baseUrl: string
  hasApiKey?: boolean
}): boolean {
  if (!profile) return false
  return Boolean(profile.hasApiKey) || isLocalEndpoint(profile.baseUrl)
}

export interface GenerationFailure {
  title: string
  message: string
  raw: string
}

export function explainGenerationFailure(error: unknown): GenerationFailure {
  const raw = errorMessage(error)
  if (/SELF_SIGNED_CERT_IN_CHAIN|CERT_AUTHORITY_INVALID|ERR_CERT|self signed certificate/i.test(raw)) {
    return {
      title: 'HTTPS 证书验证失败',
      message:
        '接口请求被本机代理或安全软件拦截。请确认代理证书已安装到 Windows 信任根证书，或暂时关闭代理后重试。',
      raw
    }
  }
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/i.test(raw)) {
    return {
      title: '找不到 AI 接口',
      message: '接口域名解析失败。请检查网络，并确认 Base URL 拼写正确。',
      raw
    }
  }
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(raw)) {
    return {
      title: 'AI 接口拒绝连接',
      message: '接口地址没有服务在监听。若是本地模型，请先启动本地服务。',
      raw
    }
  }
  if (/ERR_UNSAFE_PORT/i.test(raw)) {
    return {
      title: '接口地址无法连接',
      message: '当前端口被系统或 Chromium 安全策略拦截。请改用本地服务实际监听的端口。',
      raw
    }
  }
  if (/401|invalid.*api.*key|authentication/i.test(raw)) {
    return {
      title: 'API Key 无效',
      message: '服务端拒绝了当前 Key。请到 AI 设置重新填写并保存。',
      raw
    }
  }
  if (/429|rate limit|too many requests/i.test(raw)) {
    return {
      title: '请求过于频繁',
      message: '接口正在限流，请稍等片刻后重试。',
      raw
    }
  }
  if (/AI 接口返回 400|model/i.test(raw)) {
    return {
      title: 'AI 接口不接受当前请求',
      message: '请检查模型名称和接口兼容性。可以先在 AI 设置里点“测试连接”。',
      raw
    }
  }
  if (/思考过程|思考截断/.test(raw)) {
    return {
      title: '模型没有输出题目',
      message:
        '当前模型把推理过程当成了正文，没有输出题目 JSON。可以重试一次；若反复出现，请换用非思考型模型，或把思考强度调低。',
      raw
    }
  }
  if (/JSON|题目数量|题目结构|题目对象|题号|校验|公式|重复题|字段|应为/i.test(raw)) {
    return {
      title: '生成内容未通过校验',
      message:
        'AI 返回的题目结构不完整。系统已自动重试一次；仍失败时可直接再点重新生成，或换一个兼容性更好的模型。',
      raw
    }
  }
  if (/网络请求失败|net::ERR_|ERR_NETWORK|ERR_TIMED_OUT/i.test(raw)) {
    return {
      title: '网络连接失败',
      message: '请检查 Base URL、系统代理和本地 AI 服务状态，然后重新生成。',
      raw
    }
  }
  return {
    title: '生成试卷失败',
    message: '请求没有完成。请查看下方详细信息，修正后重试。',
    raw
  }
}

