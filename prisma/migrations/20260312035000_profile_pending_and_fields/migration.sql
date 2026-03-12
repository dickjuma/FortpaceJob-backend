ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "company_name" TEXT,
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "hourly_rate" DOUBLE PRECISION DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "service_mode" TEXT,
  ADD COLUMN IF NOT EXISTS "physical_category" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "service_area" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "company_description" TEXT,
  ADD COLUMN IF NOT EXISTS "industry" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "budget" DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hiring_capacity" INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "languages" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "avatar" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "avatar_public_id" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "avatar_file_name" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "company_logo" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "company_logo_public_id" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "company_logo_file_name" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "portfolio" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "portfolio_file_names" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "portfolio_videos" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "intro_video" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "intro_video_public_id" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "intro_video_file_name" TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS "pending_profiles" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pending_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pending_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "pending_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pending_profiles_user_id_idx" ON "pending_profiles"("user_id");
