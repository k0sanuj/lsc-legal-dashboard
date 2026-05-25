CREATE TABLE IF NOT EXISTS "AuthMagicLinkToken" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "app_user_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "request_ip" TEXT,
  "request_user_agent" TEXT,
  "consumed_ip" TEXT,
  "consumed_user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthMagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthMagicLinkToken_token_hash_key"
  ON "AuthMagicLinkToken"("token_hash");

CREATE INDEX IF NOT EXISTS "AuthMagicLinkToken_app_user_id_expires_at_idx"
  ON "AuthMagicLinkToken"("app_user_id", "expires_at");

CREATE INDEX IF NOT EXISTS "AuthMagicLinkToken_email_created_at_idx"
  ON "AuthMagicLinkToken"("email", "created_at");

CREATE INDEX IF NOT EXISTS "AuthMagicLinkToken_expires_at_idx"
  ON "AuthMagicLinkToken"("expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuthMagicLinkToken_app_user_id_fkey'
  ) THEN
    ALTER TABLE "AuthMagicLinkToken"
      ADD CONSTRAINT "AuthMagicLinkToken_app_user_id_fkey"
      FOREIGN KEY ("app_user_id") REFERENCES "AppUser"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
