import type { SlipModel } from './slipRead'

/**
 * What a slip read really cost, from the tokens logged in `slip_reads` (docs/specs/slip-import.md).
 * Prices are the Claude API's list prices in US dollars per million tokens; update this table when
 * a model in the Edge Function's `config.ts` changes, or its reads show no real cost.
 */
export interface ModelPrice {
  /** The Definições choice this model's reads are shown under. */
  choice: SlipModel
  inputPerMTok: number
  outputPerMTok: number
  /** Prompts with more input tokens than this are billed at the `long` prices (Haiku 5.5). */
  long?: { above: number; inputPerMTok: number; outputPerMTok: number }
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-haiku-5-5': {
    choice: 'economy',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    long: { above: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  },
  'claude-sonnet-5-5': { choice: 'balanced', inputPerMTok: 2, outputPerMTok: 10 },
  'claude-opus-5-5': { choice: 'best', inputPerMTok: 4, outputPerMTok: 20 },
}

/** Reads averaged for each choice in Definições. */
export const RECENT_READS = 3

/** The model ids whose reads count for a choice. */
export function modelsForChoice(choice: SlipModel): string[] {
  return Object.keys(MODEL_PRICES).filter((model) => MODEL_PRICES[model]!.choice === choice)
}

/** One `slip_reads` row, as far as cost goes. */
export interface ReadUsage {
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
}

/** Cost of one read in US dollars; null when its model has no price or its tokens were not logged. */
export function readCostUsd(read: ReadUsage): number | null {
  const price = read.model == null ? undefined : MODEL_PRICES[read.model]
  if (!price || read.input_tokens == null || read.output_tokens == null) return null
  const rates =
    price.long && read.input_tokens > price.long.above
      ? price.long
      : { inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok }
  return (read.input_tokens * rates.inputPerMTok + read.output_tokens * rates.outputPerMTok) / 1e6
}

export interface AverageCost {
  /** Average cost per read in US dollars. */
  usd: number
  /** Reads it averages, 1 to `RECENT_READS`. */
  reads: number
}

/**
 * Average cost of the first `RECENT_READS` priced reads (newest first, as the store loads them);
 * null when none can be priced, so the screen keeps the estimate.
 */
export function averageRecentCost(reads: readonly ReadUsage[]): AverageCost | null {
  const costs = reads
    .map(readCostUsd)
    .filter((cost): cost is number => cost != null)
    .slice(0, RECENT_READS)
  if (costs.length === 0) return null
  return { usd: costs.reduce((sum, cost) => sum + cost, 0) / costs.length, reads: costs.length }
}
