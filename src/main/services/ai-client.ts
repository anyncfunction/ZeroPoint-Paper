import type {
  ConnectionResult,
  ProviderProfile,
  TokenUsage
} from '../../shared/schemas'
import { fetchWithSystemStack } from './http'

export interface AiClientOptions {
  profile: ProviderProfile
  apiKey: string
  signal?: AbortSignal
  maxTokens?: number
  onUsage?: (usage: TokenUsage) => void
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
      reasoning_content?: string
    }
  }>
  error?: { message?: string; code?: string }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function endpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`
}

type MessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | undefined

function contentText(content: MessageContent): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('')
  }
  return ''
}

function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!signal) return timeoutSignal
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeoutSignal])
  }
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  timeoutSignal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('已取消生成', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('已取消生成', 'AbortError'))
      },
      { once: true }
    )
  })
}

async function requestCompletion(
  options: AiClientOptions,
  system: string,
  user: string,
  jsonMode: boolean
): Promise<string> {
  let response: Response
  try {
    response = await fetchWithSystemStack(endpoint(options.profile.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: options.profile.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.55,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
      }),
      signal: combineSignals(options.profile.timeoutMs, options.signal)
    })
  } catch (error) {
    const cause = (error as Error & { cause?: Error & { code?: string } }).cause
    const detail = cause?.code
      ? `${cause.code}: ${cause.message}`
      : cause?.message ?? (error as Error).message
    throw new Error(`网络请求失败：${detail}`)
  }

  if (!response.ok) {
    const body = await response.text()
    const error = new Error(
      `AI 接口返回 ${response.status}${body ? `：${body.slice(0, 360)}` : ''}`
    ) as Error & { status?: number; code?: string }
    error.status = response.status
    error.code = response.status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR'
    throw error
  }

  const data = (await response.json()) as ChatCompletionResponse
  if (data.error?.message) throw new Error(`AI 接口错误：${data.error.message}`)
  const promptTokens =
    data.usage?.prompt_tokens ??
    Math.ceil((system.length + user.length) / 3.2)
  const completionTokens =
    data.usage?.completion_tokens ??
    Math.ceil(contentText(data.choices?.[0]?.message?.content).length / 3.2)
  options.onUsage?.({
    promptTokens,
    completionTokens,
    totalTokens:
      data.usage?.total_tokens ?? promptTokens + completionTokens,
    requests: 1
  })
  const message = data.choices?.[0]?.message
  const content = contentText(message?.content) || message?.reasoning_content || ''
  if (!content.trim()) throw new Error('AI 接口未返回内容')
  return content
}

export async function completeJson(
  options: AiClientOptions,
  system: string,
  user: string
): Promise<string> {
  let attempt = 0
  let jsonMode = true
  while (attempt < 3) {
    try {
      return await requestCompletion(options, system, user, jsonMode)
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      const status = (error as Error & { status?: number }).status
      if (jsonMode && (status === 400 || status === 404 || status === 422)) {
        jsonMode = false
        continue
      }
      if (status === 429 || (status && status >= 500)) {
        attempt += 1
        if (attempt >= 3) throw error
        await delay(700 * 2 ** (attempt - 1), options.signal)
        continue
      }
      attempt += 1
      if (attempt >= 2) throw error
    }
  }
  throw new Error('AI 请求失败')
}

export function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error('AI 返回内容不是 JSON 对象')
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new Error('AI 返回的 JSON 格式不合法')
  }
}

export async function testConnection(
  profile: ProviderProfile,
  apiKey: string
): Promise<ConnectionResult> {
  const started = Date.now()
  try {
    const response = await requestCompletion(
      { profile: { ...profile, timeoutMs: 30_000 }, apiKey },
      '你是连接测试助手。',
      '只回复 OK',
      false
    )
    return {
      ok: true,
      message: response.trim().slice(0, 40) || '连接成功',
      latencyMs: Date.now() - started
    }
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message,
      latencyMs: Date.now() - started
    }
  }
}

