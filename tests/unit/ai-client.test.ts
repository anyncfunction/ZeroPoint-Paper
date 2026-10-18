import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AiOutputError,
  completeJson,
  testConnection
} from '../../src/main/services/ai-client'
import { setFetchImplementation, type FetchImplementation } from '../../src/main/services/http'
import { providerProfileSchema } from '../../src/shared/schemas'

const profile = providerProfileSchema.parse({
  id: 'test',
  name: 'DeepSeek',
  baseUrl: 'http://127.0.0.1:1234/v1',
  model: 'deepseek-flash',
  reasoningEffort: 'medium'
})

function completion(message: object, finishReason = 'stop'): Response {
  return Response.json({
    choices: [{ finish_reason: finishReason, message }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
  })
}

afterEach(() => {
  setFetchImplementation((input, init) => globalThis.fetch(input, init))
})

describe('AI completion contract', () => {
  it('sends DeepSeek thinking controls and reserves room for the final answer', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: '{"items":[]}' }))
    setFetchImplementation(fetch)
    await completeJson({ profile, apiKey: '', maxTokens: 3500 }, 'JSON', 'JSON')
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      max_tokens: 11692,
      response_format: { type: 'json_object' }
    })
    expect(profile.reasoningEffort).toBe('medium')
  })

  it('uses low effort when selected and caps the combined budget', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: '{}' }))
    setFetchImplementation(fetch)
    await completeJson({ profile: { ...profile, reasoningEffort: 'low' }, apiKey: '', maxTokens: 3500 }, 'JSON', 'JSON')
    await completeJson({ profile: { ...profile, reasoningEffort: 'high' }, apiKey: '', maxTokens: 30000 }, 'JSON', 'JSON')
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ reasoning_effort: 'low', max_tokens: 7596 })
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string).max_tokens).toBe(32000)
  })

  it('disables thinking only for the recovery request', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: '{}' }))
    setFetchImplementation(fetch)
    await completeJson({ profile, apiKey: '', maxTokens: 3500, thinkingMode: 'disabled' }, 'JSON', 'JSON')
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.max_tokens).toBe(3500)
  })

  it('leaves unknown compatible providers unchanged', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: '{}' }))
    setFetchImplementation(fetch)
    await completeJson({ profile: { ...profile, model: 'custom-model' }, apiKey: '', maxTokens: 1800, thinkingMode: 'disabled' }, 'JSON', 'JSON')
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string)
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.max_tokens).toBe(1800)
  })

  it.each(['', '{"items":[{"stem":"draft, not a final answer"}]}'])('never treats reasoning as a final answer: %s', async (draft) => {
    const usage = vi.fn()
    const finish = vi.fn()
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: null, reasoning_content: `分析 ${draft}` }, 'length'))
    setFetchImplementation(fetch)
    await expect(completeJson({ profile, apiKey: '', onUsage: usage, onFinishReason: finish }, 'JSON', 'JSON'))
      .rejects.toMatchObject({ name: 'AiOutputError', problem: 'reasoning_only', finishReason: 'length' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(usage).toHaveBeenCalledWith({ promptTokens: 100, completionTokens: 200, totalTokens: 300, requests: 1 })
    expect(finish).toHaveBeenCalledWith('length')
  })

  it('reads the final answer even when reasoning contains a different JSON object', async () => {
    setFetchImplementation(async () => completion({
      content: [{ type: 'text', text: '{"items":[]}' }],
      reasoning_content: '{"items":[1,2]}'
    }))
    expect(await completeJson({ profile, apiKey: '' }, 'JSON', 'JSON')).toBe('{"items":[]}')
  })

  it('reports empty content as a typed output failure', async () => {
    setFetchImplementation(async () => completion({ content: null }))
    await expect(completeJson({ profile, apiKey: '' }, 'JSON', 'JSON')).rejects.toBeInstanceOf(AiOutputError)
  })

  it('does not retry a rejected key', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => new Response('invalid key', { status: 401 }))
    setFetchImplementation(fetch)
    await expect(completeJson({ profile, apiKey: '' }, 'JSON', 'JSON')).rejects.toThrow('401')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back when the server does not support JSON mode', async () => {
    const fetch = vi.fn<FetchImplementation>()
      .mockResolvedValueOnce(new Response('response_format unsupported', { status: 400 }))
      .mockResolvedValueOnce(completion({ content: '{}' }))
    setFetchImplementation(fetch)
    expect(await completeJson({ profile, apiKey: '' }, 'JSON', 'JSON')).toBe('{}')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('response_format')
  })

  it('preserves cancellation instead of retrying it as a network error', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<FetchImplementation>(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    setFetchImplementation(fetch)
    await expect(completeJson({ profile, apiKey: '', signal: controller.signal }, 'JSON', 'JSON'))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('tests connectivity without spending a thinking budget', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: 'OK' }))
    setFetchImplementation(fetch)
    expect((await testConnection(profile, '')).ok).toBe(true)
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ thinking: { type: 'disabled' }, max_tokens: 32 })
  })

  it('preserves the connection-test budget for unknown reasoning providers', async () => {
    const fetch = vi.fn<FetchImplementation>(async () => completion({ content: 'OK' }))
    setFetchImplementation(fetch)
    expect((await testConnection({ ...profile, model: 'custom-reasoning-model' }, '')).ok).toBe(true)
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string)
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('thinking')
  })
})
