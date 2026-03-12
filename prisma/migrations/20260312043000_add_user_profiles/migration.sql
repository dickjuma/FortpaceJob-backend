CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_profiles_user_id_idx" ON "user_profiles"("user_id");
