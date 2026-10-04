import { useAuth } from '../../hooks/useAuth';
import { Redirect, Slot } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { BRAND_COLORS } from '../../constants';
import { AdminShell } from '../../components/admin/ui';

export default function AdminLayout() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-bg">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/dang-nhap" />;
  if (!isAdmin) return <Redirect href="/(app)/chuyen-di" />;

  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}
