-- verification_codes table for email code confirmation
CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code text NOT NULL,
  action text NOT NULL DEFAULT 'signup',
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- Only the owner can read their codes
DROP POLICY IF EXISTS "verification_codes_read_own" ON verification_codes;
CREATE POLICY "verification_codes_read_own"
  ON verification_codes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Only the owner can insert codes for themselves
DROP POLICY IF EXISTS "verification_codes_insert_own" ON verification_codes;
CREATE POLICY "verification_codes_insert_own"
  ON verification_codes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only the owner can mark their codes as used
DROP POLICY IF EXISTS "verification_codes_update_own" ON verification_codes;
CREATE POLICY "verification_codes_update_own"
  ON verification_codes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_code ON verification_codes(email, code) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id) WHERE used = false;
