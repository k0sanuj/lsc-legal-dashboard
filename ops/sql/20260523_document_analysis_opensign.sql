-- Additive production DB patch for DocumentAnalysis + OpenSign metadata.
-- Run once against the Legal dashboard Postgres database before promoting this build.

ALTER TABLE "LegalDocument"
  ADD COLUMN IF NOT EXISTS "signature_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_provider_request_id" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_status" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_completed_at" TIMESTAMP(3);

ALTER TABLE "SignatureRequest"
  ADD COLUMN IF NOT EXISTS "viewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "declined_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider_signer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "signing_url" TEXT;

CREATE TABLE IF NOT EXISTS "DocumentAnalysis" (
  "id" TEXT NOT NULL,
  "document_id" TEXT,
  "version_id" TEXT,
  "kyc_document_id" TEXT,
  "litigation_document_id" TEXT,
  "source_type" TEXT NOT NULL DEFAULT 'legal_document',
  "source_label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'complete',
  "summary" TEXT,
  "suggested_category" TEXT,
  "suggested_file_name" TEXT,
  "key_fields" JSONB,
  "key_dates" JSONB,
  "key_clauses" JSONB,
  "obligations" JSONB,
  "financial_terms" JSONB,
  "unusual_clauses" JSONB,
  "missing_gaps" JSONB,
  "recommended_next_steps" JSONB,
  "raw_payload" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LegalDocument_signature_provider_signature_provider_request_id_idx"
  ON "LegalDocument"("signature_provider", "signature_provider_request_id");

CREATE INDEX IF NOT EXISTS "SignatureRequest_provider_signer_id_idx"
  ON "SignatureRequest"("provider_signer_id");

CREATE INDEX IF NOT EXISTS "DocumentAnalysis_document_id_created_at_idx"
  ON "DocumentAnalysis"("document_id", "created_at");

CREATE INDEX IF NOT EXISTS "DocumentAnalysis_version_id_idx"
  ON "DocumentAnalysis"("version_id");

CREATE INDEX IF NOT EXISTS "DocumentAnalysis_kyc_document_id_created_at_idx"
  ON "DocumentAnalysis"("kyc_document_id", "created_at");

CREATE INDEX IF NOT EXISTS "DocumentAnalysis_litigation_document_id_created_at_idx"
  ON "DocumentAnalysis"("litigation_document_id", "created_at");

CREATE INDEX IF NOT EXISTS "DocumentAnalysis_source_type_status_idx"
  ON "DocumentAnalysis"("source_type", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentAnalysis_document_id_fkey'
  ) THEN
    ALTER TABLE "DocumentAnalysis"
      ADD CONSTRAINT "DocumentAnalysis_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentAnalysis_version_id_fkey'
  ) THEN
    ALTER TABLE "DocumentAnalysis"
      ADD CONSTRAINT "DocumentAnalysis_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "DocumentVersion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentAnalysis_kyc_document_id_fkey'
  ) THEN
    ALTER TABLE "DocumentAnalysis"
      ADD CONSTRAINT "DocumentAnalysis_kyc_document_id_fkey"
      FOREIGN KEY ("kyc_document_id") REFERENCES "KycDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentAnalysis_litigation_document_id_fkey'
  ) THEN
    ALTER TABLE "DocumentAnalysis"
      ADD CONSTRAINT "DocumentAnalysis_litigation_document_id_fkey"
      FOREIGN KEY ("litigation_document_id") REFERENCES "LitigationDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
