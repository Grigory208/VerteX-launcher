/*
# Harden profile creation trigger

1. Modified Database Function
- `public.handle_new_user`: sets a fixed search path so object resolution cannot be changed by a caller.

2. Security Changes
- Removes direct RPC execution permissions from anonymous and signed-in client roles.
- The function remains available to the auth trigger, which is the only intended caller.

3. Important Notes
- Existing profiles, roles, clients, and updates are unchanged.
- This migration does not remove or alter any user data.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'username', 'Игрок_' || substring(new.id::text, 1, 6)));
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;