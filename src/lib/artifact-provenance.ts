/** Distinguishes preserved originals from text reconstructed from legacy template rows. */
export function isReconstructedTemplate(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || !("provenance" in metadata)) return false
  const provenance = metadata.provenance
  return Boolean(provenance && typeof provenance === "object" && "kind" in provenance && provenance.kind === "legacy_template_text_reconstruction")
}
