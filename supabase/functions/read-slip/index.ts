// Supabase Edge Function `read-slip`: reads one bet slip image with the Claude API.
// See README.md for the secret it needs and how to deploy it.
import Anthropic from '@anthropic-ai/sdk'
import { withSupabase } from '@supabase/server'

import { slipReadJsonSchema } from '../../../src/domain/slipRead.ts'
import { READ_SLIP_MAX_TOKENS, READ_SLIP_MODELS } from './config.ts'
import { handleReadSlip, type ModelAnswer, type SlipImage } from './handler.ts'
import { SYSTEM_PROMPT, userPrompt } from './prompt.ts'

const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
const outputSchema = slipReadJsonSchema()

/** Reads the image with the model chosen for this read. */
async function readImage(input: SlipImage): Promise<ModelAnswer> {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set')
  const config = READ_SLIP_MODELS[input.model]
  const message = await anthropic.beta.messages.create({
    model: config.model,
    max_tokens: READ_SLIP_MAX_TOKENS,
    // On a refusal the API retries the request on another model in the same call (not on Haiku).
    ...(config.fallbacks
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {}),
    output_config: {
      effort: config.effort,
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
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
  if (message.stop_reason !== 'end_turn') return { text: null, ...usage }
  // After a fallback, only the text written after the last switch is the answer.
  const lastSwitch = message.content.findLastIndex((block) => block.type === 'fallback')
  const text = message.content
    .slice(lastSwitch + 1)
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  return { text: text || null, ...usage }
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
      async settingsModel() {
        const { data, error } = await ctx.supabase
          .from('user_settings')
          .select('slip_model')
          .maybeSingle()
        if (error) throw error
        return data?.slip_model ?? null
      },
      async recordRead(model) {
        const { data, error } = await ctx.supabase
          .from('slip_reads')
          .insert({ user_id: userId, model: READ_SLIP_MODELS[model].model })
          .select('id')
          .single()
        if (error) throw error
        return data.id
      },
      async recordUsage(readId, answer) {
        const { error } = await ctx.supabase
          .from('slip_reads')
          .update({ input_tokens: answer.inputTokens, output_tokens: answer.outputTokens })
          .eq('id', readId)
        if (error) throw error
      },
      readImage,
      now: () => new Date(),
    })
  }),
}
