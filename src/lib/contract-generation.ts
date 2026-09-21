/**
 * Shared availability for AI drafting and refinement. Keep the server pause in
 * place until the Claude CLI worker and its review gates replace API drafting.
 * An environment variable must not reactivate the legacy provider path.
 */
export const CONTRACT_GENERATION_PAUSED = true

export const CONTRACT_GENERATION_PAUSED_MESSAGE =
  'AI drafting and refinement are paused. Existing documents and templates remain available.'
