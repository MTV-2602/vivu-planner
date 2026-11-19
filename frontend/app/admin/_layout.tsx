import { useAuth } from '../../hooks/useAuth';
import { Redirect, Slot } from 'expo-router';
import { AdminShell } from '../../components/admin/ui';
import BrandSplash from '../../components/loading/BrandSplash';

export default function AdminLayout() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return <BrandSplash message="Đang mở bảng quản trị" />;
  }

  if (!session) return <Redirect href="/dang-nhap" />;
  if (!isAdmin) return <Redirect href="/chuyen-di" />;

  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}
