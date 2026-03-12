CREATE TABLE IF NOT EXISTS "verification_codes" (
  "id" SERIAL NOT NULL,
  "email" TEXT,
  "phone_number" TEXT,
  "code" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'register',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verification_codes_email_idx" ON "verification_codes"("email");
CREATE INDEX IF NOT EXISTS "verification_codes_phone_idx" ON "verification_codes"("phone_number");
CREATE INDEX IF NOT EXISTS "verification_codes_purpose_channel_idx" ON "verification_codes"("purpose", "channel");
