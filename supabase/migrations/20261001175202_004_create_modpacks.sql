/*
# Create modpacks table for per-user modpack editor

1. New Tables
- `modpacks`: Stores user-created modpacks with their mod lists
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to auth.uid())
  - `name` (text, not null)
  - `description` (text)
  - `mc_version` (text, Minecraft version e.g. "1.20.4")
  - `loader` (text, mod loader e.g. "fabric", "forge", "quilt", "neoforge")
  - `mods` (jsonb, array of mod objects: {project_id, slug, title, icon_url, version_id, file_name, download_url})
  - `memory` (int, RAM allocation in MB, default 4096)
  - `java_args` (text, custom JVM arguments)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `modpacks`.
- Owner-scoped CRUD: each authenticated user can only access their own modpacks.
- user_id defaults to auth.uid() so inserts work without explicitly passing it.
*/

CREATE TABLE IF NOT EXISTS modpacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  mc_version text NOT NULL DEFAULT '1.20.4',
  loader text NOT NULL DEFAULT 'fabric',
  mods jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory int NOT NULL DEFAULT 4096,
  java_args text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE modpacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_modpacks" ON modpacks;
CREATE POLICY "select_own_modpacks" ON modpacks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_modpacks" ON modpacks;
CREATE POLICY "insert_own_modpacks" ON modpacks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_modpacks" ON modpacks;
CREATE POLICY "update_own_modpacks" ON modpacks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_modpacks" ON modpacks;
CREATE POLICY "delete_own_modpacks" ON modpacks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_modpacks_user_id ON modpacks(user_id);
