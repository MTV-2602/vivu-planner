import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import BrandSplash from '../../components/loading/BrandSplash';

export default function PremiumIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    const search = (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
    router.replace((`/chuyen-di${search || ''}`) as any);
  }, []);

  return <BrandSplash message="Đang chuyển đến trang chuyến đi" />;
}
