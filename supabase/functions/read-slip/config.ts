import type { SlipModel } from '../../../src/domain/slipRead.ts'

/** One way of calling the Claude API for a read. */
export interface ReadSlipModelConfig {
  model: string
  /** Thinking depth. Reading a slip is extraction, so low is enough for the cheaper models. */
  effort: 'low' | 'medium' | 'high'
  /** Server-side fallback on a refusal; Haiku has none, and the parameter is rejected there. */
  fallbacks: boolean
}

/**
 * The model behind each choice in Definições (`user_settings.slip_model`). Change a model here and
 * deploy again to apply it. Rough cost per slip: economy ~0.1 cent, balanced ~2, best ~5 to 10.
 */
export const READ_SLIP_MODELS: Record<SlipModel, ReadSlipModelConfig> = {
  economy: { model: 'claude-haiku-5-5', effort: 'low', fallbacks: false },
  balanced: { model: 'claude-sonnet-5-5', effort: 'low', fallbacks: true },
  best: { model: 'claude-opus-5-5', effort: 'medium', fallbacks: true },
}

export const READ_SLIP_MAX_TOKENS = 16000
