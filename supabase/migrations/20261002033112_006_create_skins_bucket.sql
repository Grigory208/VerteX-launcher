/*
# Create skins storage bucket

1. Storage
- Creates a public bucket 'skins' for storing user skin textures
- Adds policies for authenticated users to upload/read/delete their own skins
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('skins', 'skins', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own skins" ON storage.objects;
CREATE POLICY "Users can upload own skins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'skins' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can read skins" ON storage.objects;
CREATE POLICY "Anyone can read skins" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'skins');

DROP POLICY IF EXISTS "Users can delete own skins" ON storage.objects;
CREATE POLICY "Users can delete own skins" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'skins' AND (storage.foldername(name))[1] = auth.uid()::text);
