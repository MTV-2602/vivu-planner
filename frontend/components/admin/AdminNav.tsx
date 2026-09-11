import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Shield, Compass, LogOut } from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';

export default function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();

  const TABS = [
    { key: 'dashboard', path: APP_ROUTES.ADMIN, label: 'Dashboard' },
    { key: 'users', path: APP_ROUTES.ADMIN_USERS, label: 'Người dùng' },
    { key: 'packages', path: APP_ROUTES.ADMIN_PACKAGES, label: 'Gói thành viên & Giá 👑' },
    { key: 'revenue', path: APP_ROUTES.ADMIN_REVENUE, label: 'Doanh thu 📊' },
    { key: 'trips', path: APP_ROUTES.ADMIN_TRIPS, label: 'Chuyến đi' },
    { key: 'keys', path: APP_ROUTES.ADMIN_KEYS, label: 'Gemini Keys' },
    { key: 'partners', path: APP_ROUTES.ADMIN_PARTNERS, label: 'Đối tác' },
  ];

  return (
    <View className="bg-brand-bg">
      <View className="border-b border-brand-line/40 px-6 py-4 flex-row justify-between items-center">
        <Pressable onPress={() => router.push(APP_ROUTES.TRIPS as any)} className="flex-row items-center gap-2">
          <Compass size={26} color={BRAND_COLORS.primary} />
          <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
        </Pressable>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ backgroundColor: `${BRAND_COLORS.accent}1A`, borderColor: `${BRAND_COLORS.accent}4D` }}>
            <Shield size={12} color={BRAND_COLORS.accent} />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: BRAND_COLORS.accent }}>Quản Trị</Text>
          </View>
          <Pressable onPress={() => signOut()} className="flex-row items-center gap-1 px-3 py-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
            <LogOut size={13} color={BRAND_COLORS.danger} />
            <Text className="text-xs font-bold" style={{ color: BRAND_COLORS.danger }}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-brand-line/40 bg-brand-bg">
        <View className="flex-row px-4">
          {TABS.map(tab => {
            const active = pathname === tab.path;
            return (
              <Pressable key={tab.key} onPress={() => router.replace(tab.path as any)} className="px-5 py-3 border-b-2" style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}>
                <Text className={`font-bold text-sm ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
