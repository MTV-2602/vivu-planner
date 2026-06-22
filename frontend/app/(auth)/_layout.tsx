import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function AuthLayout() {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (session) return <Redirect href="/chuyen-di" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
