/**
 * Deployment kill switch for CLI drafting. Enabling it still requires a fresh,
 * authenticated authorized worker; it can never select an API provider.
 */
export const CONTRACT_GENERATION_PAUSED = process.env.GENERATION_ENABLED !== '1'

export const CONTRACT_GENERATION_PAUSED_MESSAGE =
  'AI drafting and refinement are paused. Existing documents and templates remain available.'
