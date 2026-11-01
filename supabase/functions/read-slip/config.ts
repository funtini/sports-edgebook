/** How `read-slip` calls the Claude API. Change the model here; deploy again to apply it. */
export const READ_SLIP_CONFIG = {
  /** A vision-capable Claude model. */
  model: 'claude-opus-5-5',
  /** Thinking depth: reading a slip and mapping it to the catalogue needs a little reasoning. */
  effort: 'medium',
  maxTokens: 16000,
} as const
