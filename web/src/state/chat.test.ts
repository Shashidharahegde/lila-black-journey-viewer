import { describe, expect, it, vi } from 'vitest'
import { askChat, EXAMPLE_QUESTIONS, MAX_QUESTION_CHARS } from './chat'

const reply = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => Response.json(body, { status }))

describe('askChat', () => {
  it('posts the question as JSON and returns the answer', async () => {
    const doFetch = reply({ answer: 'Lockdown had 12 deaths.', usage: {} })
    expect(await askChat('How many deaths?', doFetch)).toEqual({ ok: true, answer: 'Lockdown had 12 deaths.' })
    const [url, init] = doFetch.mock.calls[0]
    expect(url).toBe('/api/chat')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ question: 'How many deaths?' })
  })

  it('passes on the server message for an error', async () => {
    const limited = await askChat('q', reply({ error: 'rate_limited', message: 'Try again in a few minutes.' }, 429))
    expect(limited).toEqual({ ok: false, message: 'Try again in a few minutes.' })
  })

  it('falls back to a plain message when the error has none', async () => {
    const result = await askChat('q', reply({}, 500))
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.message).toMatch(/try again/i)
  })

  it('says the chat is unavailable when the reply is not JSON, as on the dev server', async () => {
    const page = vi.fn<typeof fetch>(async () => new Response('<!doctype html>', { status: 200 }))
    const result = await askChat('q', page)
    expect(result.ok === false && result.message).toMatch(/not available/)
  })

  it('says the assistant could not be reached when the network fails', async () => {
    const offline = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch')))
    const result = await askChat('q', offline)
    expect(result.ok === false && result.message).toMatch(/could not reach/i)
  })
})

describe('chat constants', () => {
  it('every example fits the question limit', () => {
    for (const question of EXAMPLE_QUESTIONS) expect(question.length).toBeLessThanOrEqual(MAX_QUESTION_CHARS)
  })
})
