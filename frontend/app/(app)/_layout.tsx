import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '../../lib/supabaseClient';
import { ChatbotProvider } from '../../context/ChatbotContext';
import { ChatbotWidget } from '../../components/ChatbotWidget';

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

  const hasAdminToken = (() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
    const token = localStorage.getItem('vivu_admin_token');
    if (!token) return false;
    // Validate token expiry
    const parts = token.split(':');
    if (parts.length === 3) {
      const expiresAt = parseInt(parts[1]);
      if (!isNaN(expiresAt) && Date.now() > expiresAt) {
        // Token expired — clean up
        console.warn('[ViVu Layout] Admin token expired, cleaning up...');
        localStorage.removeItem('vivu_admin_token');
        localStorage.removeItem('vivu_mock_user');
        localStorage.removeItem('vivu_mock_token');
        return false;
      }
    }
    return true;
  })();

  const isSharePage = typeof window !== 'undefined' && window.location.pathname.includes('/share');
  if (!session && !hasAdminToken && !isSharePage) return <Redirect href="/dang-nhap" />;

  return (
    <ChatbotProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        <ChatbotWidget />
      </View>
    </ChatbotProvider>
  );
}
