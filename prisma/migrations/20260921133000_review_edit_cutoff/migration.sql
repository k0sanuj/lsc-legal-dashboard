-- Existing obligations retain their original cadence; edits affect future occurrences.
ALTER TABLE "ReviewSchedule" ADD COLUMN "cadence_effective_from" DATE;

ALTER TABLE "LegalDocument" ADD COLUMN "signature_certificate_checked_at" TIMESTAMP(3),
ADD COLUMN "signature_certificate_status" TEXT,
ADD COLUMN "signature_certificate_error" TEXT;
