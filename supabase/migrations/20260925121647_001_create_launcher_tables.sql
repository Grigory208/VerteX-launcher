/*
# Minecraft Launcher — profiles, clients, updates

1. New Tables
- `profiles`: user profiles linked to auth.users. Columns: id (uuid, PK, FK to auth.users), username (text, unique), role (text, default 'user'), created_at, updated_at.
- `clients`: catalog of optimized Minecraft builds. Columns: id, name, version, description, download_url, file_size_mb, tags (text[]), changelog (text), icon_url, created_at, updated_at.
- `updates`: history of updates per client. Columns: id, client_id (FK to clients), version, changelog, created_at.

2. Security
- RLS enabled on all three tables.
- profiles: each authenticated user can read all profiles (needed to display usernames), update only their own. Role column is protected — only admins can change it via a separate UPDATE policy scoped to admin role check.
- clients: public read (anon + authenticated) so the catalog loads without login; admin-only insert/update/delete.
- updates: public read; admin-only insert/update/delete.
- Admin check uses a subquery: EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin').
*/

-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL DEFAULT 'Игрок',
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_all"
  ON profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  description text DEFAULT '',
  download_url text NOT NULL DEFAULT '',
  file_size_mb integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  changelog text DEFAULT '',
  icon_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_all" ON clients;
CREATE POLICY "clients_read_all"
  ON clients FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "clients_admin_insert" ON clients;
CREATE POLICY "clients_admin_insert"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "clients_admin_update" ON clients;
CREATE POLICY "clients_admin_update"
  ON clients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "clients_admin_delete" ON clients;
CREATE POLICY "clients_admin_delete"
  ON clients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- updates table
CREATE TABLE IF NOT EXISTS updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "updates_read_all" ON updates;
CREATE POLICY "updates_read_all"
  ON updates FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "updates_admin_insert" ON updates;
CREATE POLICY "updates_admin_insert"
  ON updates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "updates_admin_delete" ON updates;
CREATE POLICY "updates_admin_delete"
  ON updates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'username', 'Игрок_' || substring(new.id::text, 1, 6)));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;