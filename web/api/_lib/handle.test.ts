import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import statsJson from '../../public/data/stats.json' with { type: 'json' }
import type { StatsFile } from '../../src/data/types.ts'
import { DEFAULT_MODEL, MAX_QUESTION_CHARS, handleChat, type ChatDeps } from './handle.ts'
import { buildSystemPrompt } from './prompt.ts'
import { createRateLimiter } from './rateLimit.ts'

const stats = statsJson as unknown as StatsFile
const body = async (response: Response) => (await response.json()) as { answer?: string; message?: string }
const reply = (text: string) =>
  ({ content: [{ type: 'text', text }], usage: { input_tokens: 5, output_tokens: 7 } }) as unknown as Anthropic.Message

function setup(overrides: Partial<ChatDeps> = {}) {
  const createMessage = vi.fn<ChatDeps['createMessage']>(async () => reply('Lockdown had 12 deaths.'))
  const deps: ChatDeps = {
    env: { ANTHROPIC_API_KEY: 'test-key' },
    stats,
    limiter: createRateLimiter(100, 60_000),
    createMessage,
    ...overrides,
  }
  const ask = (body: unknown, init: RequestInit = {}) =>
    handleChat(new Request('http://x/api/chat', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }), deps)
  return { createMessage, ask }
}

describe('handleChat', () => {
  it('answers a question from the model, with the stats in a cached system block', async () => {
    const { ask, createMessage } = setup()
    const response = await ask({ question: '  How many deaths on Lockdown?  ' })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ answer: 'Lockdown had 12 deaths.' })

    const params = createMessage.mock.calls[0][0]
    expect(params.model).toBe(DEFAULT_MODEL)
    expect(params.messages).toEqual([{ role: 'user', content: 'How many deaths on Lockdown?' }])
    expect(params.system).toEqual([{ type: 'text', text: buildSystemPrompt(stats), cache_control: { type: 'ephemeral' } }])
  })

  it('uses ANTHROPIC_MODEL when it is set', async () => {
    const { ask, createMessage } = setup({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-sonnet-5-5' } })
    await ask({ question: 'hi' })
    expect(createMessage.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
  })

  it('without an API key, says the chat is not set up and never calls the model', async () => {
    const { ask, createMessage } = setup({ env: {} })
    const response = await ask({ question: 'hi' })
    expect(response.status).toBe(503)
    expect((await body(response)).message).toMatch(/not set up/)
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('rejects other methods, bad bodies, empty and over-long questions', async () => {
    const { ask, createMessage } = setup()
    expect((await ask(null, { method: 'PUT', body: undefined })).status).toBe(405)
    expect((await ask('not json')).status).toBe(400)
    expect((await ask({})).status).toBe(400)
    expect((await ask({ question: '   ' })).status).toBe(400)
    expect((await ask({ question: 42 })).status).toBe(400)
    expect((await ask({ question: 'x'.repeat(MAX_QUESTION_CHARS + 1) })).status).toBe(400)
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('stops a visitor who asks too often, and says when to retry', async () => {
    const { ask, createMessage } = setup({ limiter: createRateLimiter(1, 60_000, () => 0) })
    const headers = { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }
    expect((await ask({ question: 'a' }, { headers })).status).toBe(200)
    const blocked = await ask({ question: 'b' }, { headers })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('60')
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect((await ask({ question: 'c' }, { headers: { 'x-forwarded-for': '5.6.7.8' } })).status).toBe(200)
  })

  it('turns model failures into short messages that reveal nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failWith = (error: unknown) => setup({ createMessage: async () => Promise.reject(error) }).ask({ question: 'hi' })

    const busy = await failWith(new Anthropic.RateLimitError(429, undefined, 'secret detail', new Headers()))
    expect(busy.status).toBe(429)

    const down = await failWith(new Anthropic.AuthenticationError(401, undefined, 'bad key sk-secret', new Headers()))
    expect(down.status).toBe(503)
    expect(JSON.stringify(await body(down))).not.toMatch(/secret/)

    expect((await failWith(new Error('network'))).status).toBe(503)
    log.mockRestore()
  })

  it('handles a reply with no text', async () => {
    const { ask } = setup({ createMessage: async () => ({ content: [], usage: {} }) as unknown as Anthropic.Message })
    const response = await ask({ question: 'hi' })
    expect(response.status).toBe(200)
    expect((await body(response)).answer).toMatch(/could not produce/)
  })
})
