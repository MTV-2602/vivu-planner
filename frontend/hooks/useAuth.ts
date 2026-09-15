import { useState, useEffect, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, getRoleFromToken } from '../lib/supabase';
import { UserRole, isUserPremium } from '../constants';

export interface UserProfile {
  id:            string;
  full_name:     string;
  avatar_url:    string | null;
  phone:         string | null;
  role:          UserRole;
  is_premium:    boolean;
  premium_until: string | null;
  quota_total:   number;
  quota_used:    number;
}

export interface AuthState {
  session:   Session | null;
  user:      User | null;
  profile:   UserProfile | null;
  isAdmin:   boolean;
  isPremium: boolean;
  loading:   boolean;
  signOut:   () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession]   = useState<Session | null>(null);
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [loading, setLoading]   = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    // Lay session ban dau
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Lang nghe thay doi auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // isAdmin: doc tu profile.role hoac JWT claim user_role
  const isAdmin = (() => {
    if (profile?.role === UserRole.ADMIN) return true;
    if (!session?.access_token) return false;
    return getRoleFromToken(session.access_token) === UserRole.ADMIN;
  })();

  const isPremium = isUserPremium(profile);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  return {
    session,
    user:    session?.user ?? null,
    profile,
    isAdmin,
    isPremium,
    loading,
    signOut,
    refreshProfile,
  };
}
