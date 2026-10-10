import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<{ user: { id: string; email: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const refreshProfile = useCallback(async (userId?: string) => {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user.id;
    }
    if (!uid) {
      setProfile(null);
      setProfileError('');
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      setProfile(null);
      setProfileError('Не удалось проверить роль аккаунта');
      return;
    }
    setProfile(data as Profile | null);
    setProfileError(data ? '' : 'Профиль аккаунта ещё не создан');
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      if (s) {
        setSession({ user: { id: s.user.id, email: s.user.email ?? '' } });
        refreshProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        if (!mounted) return;
        if (s) {
          setSession({ user: { id: s.user.id, email: s.user.email ?? '' } });
          await refreshProfile(s.user.id);
        } else {
          setSession(null);
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        (payload) => { setProfile(payload.new as Profile); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (!error && data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username,
        role: 'user',
      });
    }
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  return {
    profile,
    session,
    loading,
    isAdmin: profile?.role === 'admin',
    profileError,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}
