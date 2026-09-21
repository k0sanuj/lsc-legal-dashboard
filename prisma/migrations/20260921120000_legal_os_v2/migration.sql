-- Immutable source binding for the active signature request.
ALTER TABLE "LegalDocument" ADD COLUMN "signature_source_artifact_id" TEXT;

-- AlterTable
ALTER TABLE "KycDocument" ADD COLUMN     "entity_profile_id" TEXT;

-- AlterTable
ALTER TABLE "LitigationCase" ADD COLUMN     "claim_type" TEXT,
ADD COLUMN     "dispute_kind" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
ADD COLUMN     "exposure_as_of" DATE,
ADD COLUMN     "exposure_basis" TEXT,
ADD COLUMN     "exposure_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finance_post_status" TEXT,
ADD COLUMN     "last_finance_post_at" TIMESTAMP(3),
ADD COLUMN     "last_finance_post_error" TEXT;

-- CreateTable
CREATE TABLE "DocumentAccessRequest" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "document_id" TEXT,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessGrant" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "DocumentAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "usd_rate" DECIMAL(24,12) NOT NULL,
    "rate_date" DATE NOT NULL,
    "source_url" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "publish_status" TEXT NOT NULL DEFAULT 'not_requested',
    "publish_requested_by" TEXT,
    "publish_lease_until" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "template_id" TEXT,
    "source_artifact_id" TEXT,
    "stage" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "signer_scope" JSONB,
    "deliverable_scope" TEXT,
    "finalized_at" TIMESTAMP(3),
    "finalized_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "naming_metadata" JSONB,
    "proposed_name" TEXT,
    "approved_name" TEXT,
    "approved_by" TEXT,
    "drive_file_id" TEXT,
    "published_at" TIMESTAMP(3),
    "publish_error" TEXT,

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExport" (
    "id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "snapshot" JSONB NOT NULL,
    "manifest" JSONB,
    "archive_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "downloaded_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "error" TEXT,
    "lease_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NamingCode" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NamingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityProfile" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "legacy_entity" "Entity",
    "registration_number" TEXT,
    "incorporation_date" DATE,
    "registered_agent_name" TEXT,
    "registered_agent_contact" TEXT,
    "registered_office" TEXT,
    "source_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityFiling" (
    "id" TEXT NOT NULL,
    "entity_profile_id" TEXT NOT NULL,
    "filing_type" TEXT NOT NULL,
    "reporting_period" TEXT,
    "due_date" DATE,
    "filed_date" DATE,
    "source_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityOwnership" (
    "id" TEXT NOT NULL,
    "owned_entity_id" TEXT NOT NULL,
    "owner_entity_id" TEXT,
    "owner_name" TEXT,
    "percentage" DECIMAL(7,4),
    "effective_date" DATE,
    "source_reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSchedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "document_id" TEXT,
    "policy_id" TEXT,
    "owner_id" TEXT,
    "start_date" DATE NOT NULL,
    "interval_months" INTEGER,
    "steady_interval_months" INTEGER,
    "source_reference" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "task_key" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "trigger_kind" TEXT NOT NULL,
    "trigger_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDependency" (
    "id" TEXT NOT NULL,
    "source_schedule_id" TEXT NOT NULL,
    "target_schedule_id" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractGenerationWorker" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "allowed_actor_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT NOT NULL DEFAULT 'codex',
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "cli_version" TEXT,
    "model" TEXT,
    "skill_hash" TEXT,
    "verified_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "verification_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractGenerationWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractGenerationJob" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "worker_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "request_key" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output_text" TEXT,
    "output_hash" TEXT,
    "reviews" JSONB,
    "skill_hash" TEXT NOT NULL,
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "error" TEXT,
    "document_id" TEXT,
    "human_approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ContractGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentAccessRequest_requester_id_status_idx" ON "DocumentAccessRequest"("requester_id", "status");

-- CreateIndex
CREATE INDEX "DocumentAccessGrant_user_id_expires_at_idx" ON "DocumentAccessGrant"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAccessGrant_user_id_document_id_key" ON "DocumentAccessGrant"("user_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_currency_rate_date_source_url_key" ON "FxRate"("currency", "rate_date", "source_url");

-- CreateIndex
CREATE INDEX "DocumentArtifact_document_id_stage_idx" ON "DocumentArtifact"("document_id", "stage");

-- CreateIndex
CREATE INDEX "DocumentArtifact_template_id_stage_idx" ON "DocumentArtifact"("template_id", "stage");

-- CreateIndex
CREATE INDEX "DocumentExport_status_created_at_idx" ON "DocumentExport"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "NamingCode_kind_code_key" ON "NamingCode"("kind", "code");

-- CreateIndex
CREATE INDEX "EntityFiling_entity_profile_id_due_date_idx" ON "EntityFiling"("entity_profile_id", "due_date");

-- CreateIndex
CREATE INDEX "EntityOwnership_owned_entity_id_idx" ON "EntityOwnership"("owned_entity_id");

-- CreateIndex
CREATE INDEX "ReviewSchedule_document_id_idx" ON "ReviewSchedule"("document_id");

-- CreateIndex
CREATE INDEX "ReviewSchedule_policy_id_idx" ON "ReviewSchedule"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTask_task_key_key" ON "ReviewTask"("task_key");

-- CreateIndex
CREATE INDEX "ReviewTask_status_due_date_idx" ON "ReviewTask"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDependency_source_schedule_id_target_schedule_id_key" ON "ReviewDependency"("source_schedule_id", "target_schedule_id");

-- CreateIndex
CREATE INDEX "ContractGenerationWorker_actor_user_id_status_idx" ON "ContractGenerationWorker"("actor_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractGenerationJob_request_key_key" ON "ContractGenerationJob"("request_key");

-- CreateIndex
CREATE INDEX "ContractGenerationJob_actor_user_id_status_idx" ON "ContractGenerationJob"("actor_user_id", "status");

-- CreateIndex
CREATE INDEX "ContractGenerationJob_status_created_at_idx" ON "ContractGenerationJob"("status", "created_at");

-- CreateIndex
CREATE INDEX "KycDocument_entity_profile_id_idx" ON "KycDocument"("entity_profile_id");

-- CreateIndex
CREATE INDEX "LitigationCase_dispute_kind_status_idx" ON "LitigationCase"("dispute_kind", "status");

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_entity_profile_id_fkey" FOREIGN KEY ("entity_profile_id") REFERENCES "EntityProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessRequest" ADD CONSTRAINT "DocumentAccessRequest_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessRequest" ADD CONSTRAINT "DocumentAccessRequest_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessGrant" ADD CONSTRAINT "DocumentAccessGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessGrant" ADD CONSTRAINT "DocumentAccessGrant_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "DocumentArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityFiling" ADD CONSTRAINT "EntityFiling_entity_profile_id_fkey" FOREIGN KEY ("entity_profile_id") REFERENCES "EntityProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityOwnership" ADD CONSTRAINT "EntityOwnership_owned_entity_id_fkey" FOREIGN KEY ("owned_entity_id") REFERENCES "EntityProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityOwnership" ADD CONSTRAINT "EntityOwnership_owner_entity_id_fkey" FOREIGN KEY ("owner_entity_id") REFERENCES "EntityProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "PolicyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "ReviewSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDependency" ADD CONSTRAINT "ReviewDependency_source_schedule_id_fkey" FOREIGN KEY ("source_schedule_id") REFERENCES "ReviewSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDependency" ADD CONSTRAINT "ReviewDependency_target_schedule_id_fkey" FOREIGN KEY ("target_schedule_id") REFERENCES "ReviewSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LegalDocument_signature_provider_signature_provider_request_id_" RENAME TO "LegalDocument_signature_provider_signature_provider_request_idx";
