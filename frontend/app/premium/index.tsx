import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';

export default function PremiumIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    const search = (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
    router.replace((`/chuyen-di${search || ''}`) as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#059669" />
    </View>
  );
}
