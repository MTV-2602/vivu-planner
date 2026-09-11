import { useAuth } from '../../hooks/useAuth';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/dang-nhap" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
