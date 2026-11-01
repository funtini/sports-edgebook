// Supabase Edge Function `read-slip`: reads one bet slip image with the Claude API.
// See README.md for the secret it needs and how to deploy it.
import Anthropic from '@anthropic-ai/sdk'
import { withSupabase } from '@supabase/server'

import { slipReadJsonSchema } from '../../../src/domain/slipRead.ts'
import { READ_SLIP_CONFIG } from './config.ts'
import { handleReadSlip, type SlipImage } from './handler.ts'
import { SYSTEM_PROMPT, userPrompt } from './prompt.ts'

const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
const outputSchema = slipReadJsonSchema()

/** The model's JSON answer, or null when it refused or was cut off. */
async function readImage(input: SlipImage): Promise<string | null> {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set')
  const message = await anthropic.beta.messages.create({
    model: READ_SLIP_CONFIG.model,
    max_tokens: READ_SLIP_CONFIG.maxTokens,
    // On a refusal the API retries the request on another model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: READ_SLIP_CONFIG.effort,
      format: { type: 'json_schema', schema: outputSchema },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: input.mediaType, data: input.image },
          },
          { type: 'text', text: userPrompt(input.today, input.timeZone) },
        ],
      },
    ],
  })
  if (message.stop_reason !== 'end_turn') return null
  // After a fallback, only the text written after the last switch is the answer.
  const lastSwitch = message.content.findLastIndex((block) => block.type === 'fallback')
  const text = message.content
    .slice(lastSwitch + 1)
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  return text || null
}

export default {
  fetch: withSupabase({ auth: 'user' }, (req, ctx) => {
    const userId = ctx.userClaims!.id
    return handleReadSlip(req, {
      async countReadsSince(since) {
        const { count, error } = await ctx.supabase
          .from('slip_reads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since.toISOString())
        if (error) throw error
        return count ?? 0
      },
      async recordRead() {
        const { error } = await ctx.supabase.from('slip_reads').insert({ user_id: userId })
        if (error) throw error
      },
      readImage,
      now: () => new Date(),
    })
  }),
}
