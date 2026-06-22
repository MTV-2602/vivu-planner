import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';

export default function Index() {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  if (session === undefined) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center">
        <ActivityIndicator color="#1F6F54" />
      </View>
    );
  }

  return <Redirect href={session ? '/chuyen-di' : '/landing'} />;
}
