import Anthropic from '@anthropic-ai/sdk'
import stats from '../public/data/stats.json' with { type: 'json' }
import type { StatsFile } from '../src/data/types.ts'
import { handleChat } from './_lib/handle.ts'
import { createRateLimiter } from './_lib/rateLimit.ts'

// Kept at module level so the count survives between requests that reach the same warm instance.
const limiter = createRateLimiter(20, 60 * 60 * 1000)

export async function POST(request: Request): Promise<Response> {
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null
  return handleChat(request, {
    env: process.env,
    stats: stats as unknown as StatsFile,
    limiter,
    createMessage: (params) => {
      if (!client) throw new Error('no API key') // handleChat answers before it gets here
      return client.messages.create(params)
    },
  })
}

// Any other method gets the same friendly 405 from handleChat.
export const GET = POST
