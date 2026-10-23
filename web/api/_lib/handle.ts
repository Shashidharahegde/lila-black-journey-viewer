import Anthropic from '@anthropic-ai/sdk'
import type { StatsFile } from '../../src/data/types.ts'
import { buildSystemPrompt } from './prompt.ts'
import type { RateLimiter } from './rateLimit.ts'

export const DEFAULT_MODEL = 'claude-haiku-5-5'
export const MAX_QUESTION_CHARS = 500
// Headroom for the model's own reasoning at low effort as well as the visible answer.
export const MAX_OUTPUT_TOKENS = 1500

export interface ChatDeps {
  env: { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string }
  stats: StatsFile
  limiter: RateLimiter
  /** the one call to the model; replaced in tests */
  createMessage: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>
}

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const visitorOf = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'

/** One question in, one answer out. Every failure becomes a short message the chat panel can show as is. */
export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method', message: 'Send a POST request.' })
  if (!deps.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'unavailable', message: 'The chat is not set up on this deployment. The map and dashboard still work.' })
  }

  let question: unknown
  try {
    question = ((await request.json()) as { question?: unknown }).question
  } catch {
    return json(400, { error: 'bad_request', message: 'Send JSON like {"question": "..."}.' })
  }
  if (typeof question !== 'string' || !question.trim()) {
    return json(400, { error: 'bad_request', message: 'Type a question first.' })
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json(400, { error: 'too_long', message: `Keep the question under ${MAX_QUESTION_CHARS} characters.` })
  }

  const retryAfter = deps.limiter.take(visitorOf(request))
  if (retryAfter !== null) {
    return Response.json(
      { error: 'rate_limited', message: 'You have asked a lot of questions. Please try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const message = await deps.createMessage({
      model: deps.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: 'low' },
      // The stats do not change between requests, so everything in this block is read from the cache after the first one.
      system: [{ type: 'text', text: buildSystemPrompt(deps.stats), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question.trim() }],
    })
    const answer = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('').trim()
    if (!answer) {
      return json(200, { answer: 'I could not produce an answer to that. Try rephrasing the question.', usage: message.usage })
    }
    return json(200, { answer, usage: message.usage })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json(429, { error: 'busy', message: 'The assistant is busy right now. Please try again in a minute.' })
    }
    // Log the status only: the message could echo request details.
    console.error('chat failed', error instanceof Anthropic.APIError ? error.status : 'unexpected error')
    return json(503, { error: 'unavailable', message: 'The assistant is unavailable right now. The map and dashboard still work.' })
  }
}
