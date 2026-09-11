import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/dang-nhap" />;
  if (isAdmin)  return <Redirect href="/admin" />;
  return <Redirect href="/(app)/chuyen-di" />;
}
