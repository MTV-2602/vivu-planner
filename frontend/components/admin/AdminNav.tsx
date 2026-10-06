import React, { useContext } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Shield, Compass, LogOut } from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { AdminShellContext } from './ui/AdminShell';

/**
 * AdminNav cũ - Giữ tương thích ngược cho các trang đợt 2 (users, trips, keys, partners).
 * Khi trang được render bên trong AdminShell (thông qua context inShell), component này
 * tự động trả về null để tránh trùng lặp 2 thanh điều hướng.
 */
export default function AdminNav() {
  const { inShell } = useContext(AdminShellContext);
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();

  // Đã nằm trong AdminShell thì ẩn thanh nav cũ để không bị hiển thị đôi
  if (inShell) {
    return null;
  }

  const TABS = [
    { key: 'dashboard', path: APP_ROUTES.ADMIN, label: 'Tổng quan' },
    { key: 'revenue', path: APP_ROUTES.ADMIN_REVENUE, label: 'Doanh thu' },
    { key: 'packages', path: APP_ROUTES.ADMIN_PACKAGES, label: 'Gói cước' },
    { key: 'users', path: APP_ROUTES.ADMIN_USERS, label: 'Người dùng' },
    { key: 'trips', path: APP_ROUTES.ADMIN_TRIPS, label: 'Chuyến đi' },
    { key: 'posts', path: APP_ROUTES.ADMIN_POSTS, label: 'Bài đăng 📝' },
    { key: 'keys', path: APP_ROUTES.ADMIN_KEYS, label: 'AI & Keys' },
    { key: 'partners', path: APP_ROUTES.ADMIN_PARTNERS, label: 'Đối tác' },
  ];

  return (
    <View className="bg-brand-bg">
      <View className="border-b border-brand-line/40 px-6 py-4 flex-row justify-between items-center bg-white">
        <Pressable onPress={() => router.push(APP_ROUTES.ADMIN as any)} className="flex-row items-center gap-2">
          <Compass size={26} color={BRAND_COLORS.primary} />
          <View className="flex-row items-baseline gap-1.5">
            <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
            <View className="px-2 py-0.5 rounded bg-brand-primary/10 border border-brand-primary/20">
              <Text className="text-[10px] font-extrabold text-brand-primary uppercase tracking-wider">Hệ Thống Quản Trị</Text>
            </View>
          </View>
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
          {TABS.map((tab) => {
            const active = pathname === tab.path;
            return (
              <Pressable
                key={tab.key}
                onPress={() => router.replace(tab.path as any)}
                className="px-5 py-3 border-b-2"
                style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}
              >
                <Text className={`font-bold text-sm ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
