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
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const text = (fenced?.[1] ?? raw).trim()
  const start = text.search(/[{[]/)
  if (start < 0) {
    const head = text.replace(/\s+/g, ' ').slice(0, 120)
    throw new Error(`AI 返回内容不是 JSON${head ? `（开头：${head}）` : ''}`)
  }

  const candidate = text.slice(start)
  const balanced = extractBalancedJson(candidate) ?? candidate
  const parsed = tryParseJson(balanced) ?? tryParseJson(closeTruncatedJson(balanced))
  if (parsed !== undefined) {
    return Array.isArray(parsed) ? { items: parsed } : parsed
  }
  throw new Error('AI 返回的 JSON 格式不合法')
}

function extractBalancedJson(value: string): string | null {
  if (value[0] !== '{' && value[0] !== '[') return null
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{' || char === '[') stack.push(char)
    else if (char === '}' || char === ']') {
      stack.pop()
      if (stack.length === 0) return value.slice(0, index + 1)
    }
  }
  return null
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    const withoutTrailingCommas = value.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(withoutTrailingCommas)
    } catch {
      return undefined
    }
  }
}

// 扫描到字符串、转义和括号嵌套都合法的最远位置，再补齐未闭合的括号。
function closeTruncatedJson(value: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  let safeEnd = 0
  let lastShallowComma = -1
  let lastOpen = -1
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') {
        inString = false
        if (stack.length > 0) safeEnd = index + 1
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      stack.push(char)
      lastOpen = index
    } else if (char === '}' || char === ']') {
      stack.pop()
      if (stack.length > 0) safeEnd = index + 1
    } else if (char === ',' && stack.length > 0) {
      safeEnd = index
      if (stack.length <= 2) lastShallowComma = index
    }
  }

  if (stack.length === 0) return value
  let cut = safeEnd
  if (inString) {
    // 优先在数组元素之间截断，丢掉被截断的最后一个元素，保留完整题目。
    cut = lastShallowComma >= 0 ? lastShallowComma : lastOpen + 1
  }
  let repaired = value.slice(0, Math.max(cut, 0)).replace(/,\s*$/, '')
  if (repaired.trim() === '') repaired = value.slice(0, Math.max(lastOpen + 1, 0))
  const open = openBrackets(repaired)
  for (let index = open.length - 1; index >= 0; index -= 1) {
    repaired += open[index] === '{' ? '}' : ']'
  }
  return repaired
}

function openBrackets(value: string): string[] {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const char of value) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{' || char === '[') stack.push(char)
    else if (char === '}' || char === ']') stack.pop()
  }
  return stack
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

