import { Stack, Redirect, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { consumePendingRedirect } from '../../lib/redirect';
import BrandSplash from '../../components/loading/BrandSplash';

export default function AuthLayout() {
  const { session, isAdmin, loading } = useAuth();
  // Lấy tham số ?redirect= từ URL đăng nhập (ví dụ /dang-nhap?redirect=/chuyen-di/moi?draft_id=...)
  // Phải dùng useGlobalSearchParams: layout không nhận query của route con qua useLocalSearchParams
  const params = useGlobalSearchParams<{ redirect?: string }>();

  // Trạng thái đang phân giải đích chuyển hướng sau đăng nhập
  const [resolving, setResolving] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    // Chỉ chạy khi session vừa xuất hiện và không phải admin
    if (!session || isAdmin) return;
    // Phân giải đích: ưu tiên ?redirect= → AsyncStorage → mặc định /chuyen-di
    // consumePendingRedirect xóa key AsyncStorage để tránh dùng lại
    setResolving(true);
    consumePendingRedirect(params.redirect)
      .then((resolved) => setTarget(resolved || '/chuyen-di'))
      .finally(() => setResolving(false));
  }, [!!session, isAdmin]);

  if (loading) {
    return <BrandSplash />;
  }

  if (session) {
    if (isAdmin) return <Redirect href="/admin" />;
    // Hiển thị splash trong khi phân giải redirect để tránh chớp màn hình
    if (resolving || target === null) return <BrandSplash />;
    return <Redirect href={target as any} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
