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
  isGoogleLinked: boolean;
  googleIdentityEmail: string | null;
  signOut:   () => Promise<void>;
  refreshProfile: () => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  unlinkGoogleAccount: () => Promise<void>;
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
        .maybeSingle();

      if (data) {
        setProfile(data);
      } else {
        // Neu chua co profile (VD: dang nhap Google lan dau), tu dong tao profile moi
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (user) {
          const newProfile: UserProfile = {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Nguời dùng ViVu',
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            phone: null,
            role: UserRole.USER,
            is_premium: false,
            premium_until: null,
            quota_total: 5,
            quota_used: 0,
          };
          await supabase.from('profiles').upsert(newProfile);
          setProfile(newProfile);
        } else {
          setProfile(null);
        }
      }
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

  // Tu dong kiem tra va huy lien ket neu email Google khong trung khop voi email dang ky
  useEffect(() => {
    if (!session?.user) return;
    const user = session.user;
    const rawGoogleIdentity = user.identities?.find((i: any) => i.provider === 'google');
    if (rawGoogleIdentity && user.email) {
      const gEmail = ((rawGoogleIdentity.identity_data as any)?.email || (rawGoogleIdentity as any).email || '').toLowerCase();
      const pEmail = user.email.toLowerCase();
      if (gEmail && pEmail && gEmail !== pEmail) {
        // Huy lien ket tren Supabase server vi email khong trung khop
        supabase.auth.unlinkIdentity(rawGoogleIdentity).then(async () => {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(
              'vivu_link_error',
              `Email tài khoản Google (${gEmail}) không trùng khớp với Email đăng ký (${pEmail}) của bạn!`
            );
          }
          // Refetch user data tu Supabase
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            setSession((prev) => prev ? { ...prev, user: userData.user } : prev);
          }
        }).catch((err) => {
          console.warn('[useAuth] Unlink mismatched Google identity error:', err);
        });
      }
    }
  }, [session]);

  // Read Google identity status with strict email matching check
  const rawGoogleIdentity = session?.user?.identities?.find((i: any) => i.provider === 'google');
  const rawGoogleEmail = rawGoogleIdentity ? ((rawGoogleIdentity.identity_data as any)?.email || (rawGoogleIdentity as any).email || '').toLowerCase() : '';
  const currentPrimaryEmail = session?.user?.email ? session.user.email.toLowerCase() : '';

  const isEmailMatching = !!(rawGoogleEmail && currentPrimaryEmail && rawGoogleEmail === currentPrimaryEmail);
  const isGoogleLinked = !!(rawGoogleIdentity && isEmailMatching);
  const googleIdentityEmail = isGoogleLinked ? rawGoogleEmail : null;

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

  const linkGoogleAccount = async () => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/dang-nhap`
      : 'vivuplanner://';

    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
  };

  const unlinkGoogleAccount = async () => {
    const identityToUnlink = session?.user?.identities?.find((i: any) => i.provider === 'google');
    if (identityToUnlink) {
      const { error } = await supabase.auth.unlinkIdentity(identityToUnlink);
      if (error) throw error;
      const { data: { session: updatedSession } } = await supabase.auth.getSession();
      setSession(updatedSession);
    }
  };

  return {
    session,
    user:    session?.user ?? null,
    profile,
    isAdmin,
    isPremium,
    loading,
    isGoogleLinked,
    googleIdentityEmail,
    signOut,
    refreshProfile,
    linkGoogleAccount,
    unlinkGoogleAccount,
  };
}
