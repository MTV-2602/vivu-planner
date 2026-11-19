import { useAuth } from '../../hooks/useAuth';
import { Redirect, Stack, useSegments, usePathname, useGlobalSearchParams } from 'expo-router';
import { Platform, View } from 'react-native';
import { ChatbotProvider } from '../../context/ChatbotContext';
import { ChatbotWidget } from '../../components/ChatbotWidget';
import ScreenErrorBoundary from '../../components/ScreenErrorBoundary';
import BrandSplash from '../../components/loading/BrandSplash';

export default function AppLayout() {
  const { session, loading, isAdmin } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();

  if (loading) {
    return <BrandSplash />;
  }

  // Cho phép route join tự xử lý auth để lưu redirect_after_login
  const isJoinRoute = (segments as string[]).some(s => s === 'join');

  if (!session && !isJoinRoute) {
    // Trên web: dùng window.location để lấy đường dẫn chính xác kể cả khi
    // expo-router chưa phân giải xong (tránh pathname = "/" sai lúc first render)
    let fullPath: string;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const loc = window.location;
      // Loại bỏ tham số ?redirect= lồng nhau
      const rawSearch = loc.search || '';
      const sp = new URLSearchParams(rawSearch);
      sp.delete('redirect');
      const cleanSearch = sp.toString() ? `?${sp.toString()}` : '';
      fullPath = loc.pathname + cleanSearch;
    } else {
      // Native: dùng hook expo-router như cũ
      const qs = Object.entries(globalParams)
        .filter(([k]) => k !== 'redirect') // tránh lồng redirect
        .map(([k, v]) => {
          const vals = Array.isArray(v) ? v : [v];
          return vals.map(val => `${encodeURIComponent(k)}=${encodeURIComponent(val ?? '')}`).join('&');
        })
        .filter(Boolean)
        .join('&');
      fullPath = qs ? `${pathname}?${qs}` : pathname;
    }
    const redirectParam = encodeURIComponent(fullPath);
    return <Redirect href={`/dang-nhap?redirect=${redirectParam}` as any} />;
  }
  if (isAdmin) return <Redirect href="/admin" />;

  return (
    <ScreenErrorBoundary fallbackTitle="Lỗi màn hình ứng dụng">
      <ChatbotProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
          <ChatbotWidget />
        </View>
      </ChatbotProvider>
    </ScreenErrorBoundary>
  );
}
