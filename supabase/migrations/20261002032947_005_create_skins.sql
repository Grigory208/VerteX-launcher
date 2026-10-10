/*
# Create skins table for per-user custom skins

1. New Tables
- `skins`: Stores user-uploaded skin metadata
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to auth.uid())
  - `skin_url` (text, URL to the skin texture file)
  - `skin_type` (text: 'classic' or 'slim')
  - `active` (boolean, whether this is the currently active skin)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `skins`.
- Owner-scoped CRUD: each authenticated user can only access their own skins.
*/

CREATE TABLE IF NOT EXISTS skins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  skin_url text NOT NULL DEFAULT '',
  skin_type text NOT NULL DEFAULT 'classic',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE skins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_skins" ON skins;
CREATE POLICY "select_own_skins" ON skins FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_skins" ON skins;
CREATE POLICY "insert_own_skins" ON skins FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_skins" ON skins;
CREATE POLICY "update_own_skins" ON skins FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_skins" ON skins;
CREATE POLICY "delete_own_skins" ON skins FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_skins_user_id ON skins(user_id);
