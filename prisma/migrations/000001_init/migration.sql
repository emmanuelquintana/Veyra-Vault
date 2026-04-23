CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "vaults" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" integer NOT NULL DEFAULT 1,
  "salt" text NOT NULL,
  "iv" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iterations" integer NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vaults_updated_at_idx" ON "vaults" ("updated_at" DESC);
