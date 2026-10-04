import { useAuth } from '../../hooks/useAuth';
import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ChatbotProvider } from '../../context/ChatbotContext';
import { ChatbotWidget } from '../../components/ChatbotWidget';

export default function AppLayout() {
  const { session, loading, isAdmin } = useAuth();
  const segments = useSegments();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Cho phép route join tự xử lý auth để lưu redirect_after_login
  const isJoinRoute = (segments as string[]).some(s => s === 'join');

  if (!session && !isJoinRoute) return <Redirect href="/(auth)/dang-nhap" />;
  if (isAdmin) return <Redirect href="/admin" />;

  return (
    <ChatbotProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        <ChatbotWidget />
      </View>
    </ChatbotProvider>
  );
}
