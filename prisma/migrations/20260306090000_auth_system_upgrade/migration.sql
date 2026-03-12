ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone_number" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phone_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "users"
  ALTER COLUMN "password" DROP NOT NULL;

UPDATE "users"
SET "phone_number" = NULL
WHERE "phone_number" IS NOT NULL
  AND BTRIM("phone_number") = '';

WITH ranked_phones AS (
  SELECT "id", "phone_number", ROW_NUMBER() OVER (PARTITION BY "phone_number" ORDER BY "id") AS rn
  FROM "users"
  WHERE "phone_number" IS NOT NULL
)
UPDATE "users" u
SET "phone_number" = NULL
FROM ranked_phones r
WHERE u."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_number_key" ON "users"("phone_number");

CREATE TABLE IF NOT EXISTS "auth_providers" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_providers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_providers_provider_provider_user_id_key"
  ON "auth_providers"("provider", "provider_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "auth_providers_user_id_provider_key"
  ON "auth_providers"("user_id", "provider");

CREATE TABLE IF NOT EXISTS "phone_verification_codes" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "phone_number" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phone_verification_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "phone_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "phone_verification_codes_user_phone_consumed_idx"
  ON "phone_verification_codes"("user_id", "phone_number", "consumed_at");
CREATE INDEX IF NOT EXISTS "phone_verification_codes_expires_at_idx"
  ON "phone_verification_codes"("expires_at");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key"
  ON "password_reset_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_expires_idx"
  ON "password_reset_tokens"("user_id", "expires_at");
