DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'skills' AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "skills" TYPE TEXT[]
      USING CASE
        WHEN jsonb_typeof("skills") = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("skills"))
        ELSE '{}'::text[]
      END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'languages' AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "languages" TYPE TEXT[]
      USING CASE
        WHEN jsonb_typeof("languages") = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("languages"))
        ELSE '{}'::text[]
      END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'portfolio' AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "portfolio" TYPE TEXT[]
      USING CASE
        WHEN jsonb_typeof("portfolio") = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("portfolio"))
        ELSE '{}'::text[]
      END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'portfolio_file_names' AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "portfolio_file_names" TYPE TEXT[]
      USING CASE
        WHEN jsonb_typeof("portfolio_file_names") = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("portfolio_file_names"))
        ELSE '{}'::text[]
      END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'portfolio_videos' AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "portfolio_videos" TYPE TEXT[]
      USING CASE
        WHEN jsonb_typeof("portfolio_videos") = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("portfolio_videos"))
        ELSE '{}'::text[]
      END;
  END IF;
END $$;

ALTER TABLE "users"
  ALTER COLUMN "skills" SET DEFAULT '{}'::text[],
  ALTER COLUMN "languages" SET DEFAULT '{}'::text[],
  ALTER COLUMN "portfolio" SET DEFAULT '{}'::text[],
  ALTER COLUMN "portfolio_file_names" SET DEFAULT '{}'::text[],
  ALTER COLUMN "portfolio_videos" SET DEFAULT '{}'::text[];
