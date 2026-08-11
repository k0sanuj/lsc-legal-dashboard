-- Additive production DB patch for the redline editor/tracker and the legal
-- tracker channel notifier.
-- Run once against the Legal dashboard Postgres database before promoting this build.

ALTER TABLE "LegalDocument"
  ADD COLUMN IF NOT EXISTS "last_tracker_notified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tracker_notify_status" TEXT,
  ADD COLUMN IF NOT EXISTS "last_tracker_notify_error" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedlineStatus') THEN
    CREATE TYPE "RedlineStatus" AS ENUM (
      'DRAFT',
      'INTERNAL_REVIEW',
      'SENT_TO_COUNTERPARTY',
      'COUNTERPARTY_RESPONDED',
      'ACCEPTED',
      'REJECTED',
      'SUPERSEDED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedlineChangeType') THEN
    CREATE TYPE "RedlineChangeType" AS ENUM (
      'INSERTION',
      'DELETION',
      'REPLACEMENT',
      'COMMENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedlineChangeStatus') THEN
    CREATE TYPE "RedlineChangeStatus" AS ENUM (
      'OPEN',
      'ACCEPTED',
      'REJECTED',
      'COUNTERED',
      'WITHDRAWN'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedlineParty') THEN
    CREATE TYPE "RedlineParty" AS ENUM ('US', 'COUNTERPARTY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Redline" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "version_id" TEXT,
  "title" TEXT NOT NULL,
  "round" INTEGER NOT NULL DEFAULT 1,
  "status" "RedlineStatus" NOT NULL DEFAULT 'DRAFT',
  "counterparty" TEXT,
  "base_text" TEXT NOT NULL,
  "proposed_text" TEXT NOT NULL,
  "summary" TEXT,
  "our_position" TEXT,
  "created_by" TEXT NOT NULL,
  "assigned_to" TEXT,
  "sent_at" TIMESTAMP(3),
  "responded_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Redline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RedlineChange" (
  "id" TEXT NOT NULL,
  "redline_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "clause_ref" TEXT,
  "change_type" "RedlineChangeType" NOT NULL,
  "original_text" TEXT,
  "proposed_text" TEXT,
  "rationale" TEXT,
  "risk_level" TEXT,
  "status" "RedlineChangeStatus" NOT NULL DEFAULT 'OPEN',
  "raised_by" "RedlineParty" NOT NULL DEFAULT 'US',
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedlineChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RedlineEvent" (
  "id" TEXT NOT NULL,
  "redline_id" TEXT NOT NULL,
  "from_status" "RedlineStatus",
  "to_status" "RedlineStatus" NOT NULL,
  "actor" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedlineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Redline_document_id_round_idx"
  ON "Redline"("document_id", "round");

CREATE INDEX IF NOT EXISTS "Redline_status_idx"
  ON "Redline"("status");

CREATE INDEX IF NOT EXISTS "Redline_assigned_to_idx"
  ON "Redline"("assigned_to");

CREATE INDEX IF NOT EXISTS "Redline_version_id_idx"
  ON "Redline"("version_id");

CREATE INDEX IF NOT EXISTS "RedlineChange_redline_id_position_idx"
  ON "RedlineChange"("redline_id", "position");

CREATE INDEX IF NOT EXISTS "RedlineChange_status_idx"
  ON "RedlineChange"("status");

CREATE INDEX IF NOT EXISTS "RedlineEvent_redline_id_created_at_idx"
  ON "RedlineEvent"("redline_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Redline_document_id_fkey'
  ) THEN
    ALTER TABLE "Redline"
      ADD CONSTRAINT "Redline_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Redline_version_id_fkey'
  ) THEN
    ALTER TABLE "Redline"
      ADD CONSTRAINT "Redline_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "DocumentVersion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RedlineChange_redline_id_fkey'
  ) THEN
    ALTER TABLE "RedlineChange"
      ADD CONSTRAINT "RedlineChange_redline_id_fkey"
      FOREIGN KEY ("redline_id") REFERENCES "Redline"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RedlineEvent_redline_id_fkey'
  ) THEN
    ALTER TABLE "RedlineEvent"
      ADD CONSTRAINT "RedlineEvent_redline_id_fkey"
      FOREIGN KEY ("redline_id") REFERENCES "Redline"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
