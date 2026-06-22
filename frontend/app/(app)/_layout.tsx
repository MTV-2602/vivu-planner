import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabaseClient';

export default function AppLayout() {
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

  if (session === undefined) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center">
        <ActivityIndicator color="#1F6F54" />
      </View>
    );
  }

  if (!session) return <Redirect href="/dang-nhap" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
