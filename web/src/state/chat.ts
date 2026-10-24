// The browser's side of the chat: one question to /api/chat, one answer back. No imports, because api/_lib/handle.ts
// also reads MAX_QUESTION_CHARS from here and runs outside Vite.

export const MAX_QUESTION_CHARS = 500

/** Shown before the first question. They are about what the statistics hold, plus one the data cannot answer, so the
 * refusal is visible up front. */
export const EXAMPLE_QUESTIONS = [
  'How many deaths were recorded on Lockdown?',
  'What does "Few matches" mean?',
  'Which map has the most loot per journey?',
  'Who wins fights between players?',
]

export type ChatResult = { ok: true; answer: string } | { ok: false; message: string }

const UNREACHABLE = 'Could not reach the assistant. Check your connection and try again.'
const NOT_HERE = 'The chat is not available in this environment. The Overview and Explore still work.'

/** Never throws: every failure comes back as a message that can be shown as is. */
export async function askChat(question: string, doFetch: typeof fetch = fetch, signal?: AbortSignal): Promise<ChatResult> {
  let response: Response
  try {
    response = await doFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal,
    })
  } catch {
    return { ok: false, message: UNREACHABLE }
  }

  // The dev server answers an unknown path with the app's own page, so a body that is not JSON means no API is running.
  let body: { answer?: unknown; message?: unknown } | null
  try {
    body = (await response.json()) as typeof body
  } catch {
    return { ok: false, message: NOT_HERE }
  }
  if (!body || typeof body !== 'object') return { ok: false, message: NOT_HERE }
  if (response.ok && typeof body.answer === 'string') return { ok: true, answer: body.answer }
  return { ok: false, message: typeof body.message === 'string' ? body.message : 'Something went wrong. Please try again.' }
}
