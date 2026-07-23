import { useEffect } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../lib/apiClient';

export default function PremiumSuccessRedirect() {
  const router = useRouter();

  useEffect(() => {
    async function processRedirect() {
      try {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        if (search) {
          await apiClient.get(`/payment/verify-return${search}`);
        }
      } catch (e) {
        console.error('Redirect verify error:', e);
      } finally {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        router.replace((`/chuyen-di${search || '?payment=success'}`) as any);
      }
    }
    processRedirect();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color="#059669" />
      <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '700', color: '#064E3B' }}>
        Đang xác thực thanh toán và kích hoạt lượt AI...
      </Text>
    </View>
  );
}
