import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';
import BrandSplash from '../../components/loading/BrandSplash';

export default function PremiumSuccessRedirect() {
  const router = useRouter();

  useEffect(() => {
    async function processRedirect() {
      try {
        const search = (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
        if (search) {
          await api.get(`/payment/verify-return${search}`);
        }
      } catch (e) {
        console.error('Redirect verify error:', e);
      } finally {
        // Luôn chuyển về /chuyen-di?paid=1 để trang chủ hiển thị banner thành công
        // mà không cần gọi verify-return lại (đã xử lý ở trên)
        router.replace('/chuyen-di?paid=1' as any);
      }
    }
    processRedirect();
  }, []);

  return <BrandSplash message="Đang xác thực thanh toán và kích hoạt lượt AI" />;
}
