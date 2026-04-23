CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" varchar(80) NOT NULL UNIQUE,
  "email" varchar(320) NOT NULL UNIQUE,
  "display_name" varchar(120),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
);

ALTER TABLE "vaults"
ADD COLUMN IF NOT EXISTS "theme_mode" varchar(16) NOT NULL DEFAULT 'dark',
ADD COLUMN IF NOT EXISTS "accent_id" varchar(32) NOT NULL DEFAULT 'forest',
ADD COLUMN IF NOT EXISTS "background_id" varchar(32) NOT NULL DEFAULT 'grid',
ADD COLUMN IF NOT EXISTS "recovery_email" varchar(320),
ADD COLUMN IF NOT EXISTS "recovery_hint" varchar(180),
ADD COLUMN IF NOT EXISTS "recovery_salt" text,
ADD COLUMN IF NOT EXISTS "recovery_iv" text,
ADD COLUMN IF NOT EXISTS "recovery_ciphertext" text,
ADD COLUMN IF NOT EXISTS "account_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vaults_account_id_fkey'
  ) THEN
    ALTER TABLE "vaults"
    ADD CONSTRAINT "vaults_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vaults_account_id_idx" ON "vaults" ("account_id");
