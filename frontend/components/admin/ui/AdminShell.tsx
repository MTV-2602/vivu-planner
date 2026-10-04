import React, { useState, createContext, useContext } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Users,
  Compass,
  Key,
  Handshake,
  LogOut,
  Menu,
  X,
  Shield,
} from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { AdminToastProvider } from './Toast';

// Context to signal child components that they are inside AdminShell
export const AdminShellContext = createContext<{ inShell: boolean }>({ inShell: false });

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Tổng quan', path: APP_ROUTES.ADMIN, icon: LayoutDashboard },
  { key: 'revenue', label: 'Doanh thu', path: APP_ROUTES.ADMIN_REVENUE, icon: TrendingUp },
  { key: 'packages', label: 'Gói cước', path: APP_ROUTES.ADMIN_PACKAGES, icon: Package },
  { key: 'users', label: 'Người dùng', path: APP_ROUTES.ADMIN_USERS, icon: Users },
  { key: 'trips', label: 'Chuyến đi', path: APP_ROUTES.ADMIN_TRIPS, icon: Compass },
  { key: 'keys', label: 'AI & API Keys', path: APP_ROUTES.ADMIN_KEYS, icon: Key },
  { key: 'partners', label: 'Đối tác', path: APP_ROUTES.ADMIN_PARTNERS, icon: Handshake },
];

export interface AdminShellProps {
  children: React.ReactNode;
}

export default function AdminShell({ children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const isDesktop = width >= 1024;
  const adminName = profile?.full_name || user?.email?.split('@')[0] || 'Admin';
  const adminEmail = user?.email || 'admin@vivuplanner.vn';

  const navigateTo = (path: string) => {
    setMobileDrawerOpen(false);
    if (pathname !== path) {
      router.push(path as any);
    }
  };

  // Nav item renderer
  const renderNavList = () => (
    <View className="gap-1.5 py-2">
      {ADMIN_NAV_ITEMS.map((item) => {
        const IconComponent = item.icon;
        // Match exact or child route
        const isActive =
          pathname === item.path ||
          (item.path !== APP_ROUTES.ADMIN && pathname.startsWith(item.path));

        return (
          <Pressable
            key={item.key}
            onPress={() => navigateTo(item.path)}
            className={`flex-row items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all ${
              isActive
                ? 'bg-brand-primary text-white shadow-xs'
                : 'hover:bg-brand-line/10'
            }`}
            style={{
              backgroundColor: isActive ? BRAND_COLORS.primary : 'transparent',
              cursor: 'pointer' as any,
            }}
          >
            <IconComponent
              size={18}
              color={isActive ? '#FFFFFF' : BRAND_COLORS.textSoft}
            />
            <Text
              className={`text-sm font-semibold flex-1 ${
                isActive ? 'text-white font-bold' : 'text-brand-textSoft'
              }`}
              style={{ color: isActive ? '#FFFFFF' : BRAND_COLORS.textSoft }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <AdminToastProvider>
      <AdminShellContext.Provider value={{ inShell: true }}>
        <View className="flex-1 flex-col lg:flex-row bg-brand-bg w-full h-full min-h-screen">
          {/* ======================================================== */}
          {/* DESKTOP SIDEBAR (width >= 1024px)                        */}
          {/* ======================================================== */}
          {isDesktop && (
            <View
              className="w-64 bg-white border-r border-brand-line/40 flex-col justify-between shrink-0 select-none shadow-xs"
              style={{
                height: '100vh' as any,
                maxHeight: '100vh' as any,
                position: Platform.OS === 'web' ? ('sticky' as any) : undefined,
                top: 0,
              }}
            >
              {/* Brand Header */}
              <View className="p-5 border-b border-brand-line/20 shrink-0">
                <Pressable
                  onPress={() => navigateTo(APP_ROUTES.ADMIN)}
                  className="flex-row items-center gap-3"
                  style={{ cursor: 'pointer' as any }}
                >
                  <View
                    className="w-9 h-9 rounded-xl items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(31, 111, 84, 0.1)' }}
                  >
                    <Compass size={22} color={BRAND_COLORS.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-display font-black text-lg text-brand-text">
                      ViVu Planner
                    </Text>
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Shield size={10} color={BRAND_COLORS.primary} />
                      <Text className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                        Hệ Thống Quản Trị
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              {/* Navigation Menu */}
              <ScrollView
                className="flex-1 px-3 py-3"
                showsVerticalScrollIndicator={false}
              >
                <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider px-3 mb-2">
                  Quản Trị Hệ Thống
                </Text>
                {renderNavList()}
              </ScrollView>

              {/* Bottom Admin Profile & Actions */}
              <View className="p-3 border-t border-brand-line/20 bg-slate-50/80 gap-2.5 shrink-0">
                {/* Admin info */}
                <View className="flex-row items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-brand-line/20 shadow-xs">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(31, 111, 84, 0.12)' }}
                  >
                    <Text className="text-xs font-bold text-brand-primary">
                      {adminName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      className="text-xs font-bold text-brand-text truncate"
                      numberOfLines={1}
                    >
                      {adminName}
                    </Text>
                    <Text
                      className="text-[10px] text-brand-textMuted truncate"
                      numberOfLines={1}
                    >
                      {adminEmail}
                    </Text>
                  </View>
                </View>

                {/* Sign out */}
                <Pressable
                  onPress={() => signOut()}
                  className="flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50/80 hover:bg-red-100 transition-colors shadow-xs"
                  style={{ cursor: 'pointer' as any }}
                >
                  <LogOut size={14} color={BRAND_COLORS.danger} />
                  <Text className="text-xs font-bold text-red-700">
                    Đăng xuất
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ======================================================== */}
          {/* MOBILE / NARROW HEADER (< 1024px)                        */}
          {/* ======================================================== */}
          {!isDesktop && (
            <View className="bg-white border-b border-brand-line/40 shrink-0">
              <View className="px-4 py-3 flex-row items-center justify-between">
                <Pressable
                  onPress={() => setMobileDrawerOpen(true)}
                  className="p-2 rounded-xl hover:bg-slate-100 border border-brand-line/40"
                  style={{ cursor: 'pointer' as any }}
                >
                  <Menu size={20} color={BRAND_COLORS.text} />
                </Pressable>

                <Pressable
                  onPress={() => navigateTo(APP_ROUTES.ADMIN)}
                  className="flex-row items-center gap-2"
                >
                  <Compass size={20} color={BRAND_COLORS.primary} />
                  <Text className="font-display font-bold text-base text-brand-text">
                    ViVu Quản Trị
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => signOut()}
                  className="p-2 rounded-xl bg-red-50/80 border border-red-200"
                  style={{ cursor: 'pointer' as any }}
                  accessibilityLabel="Đăng xuất"
                >
                  <LogOut size={16} color={BRAND_COLORS.danger} />
                </Pressable>
              </View>

              {/* Horizontal Scrollable Tabs on narrow screens */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="border-t border-brand-line/20 bg-slate-50/50 px-2"
              >
                <View className="flex-row py-1.5 gap-1">
                  {ADMIN_NAV_ITEMS.map((item) => {
                    const isActive =
                      pathname === item.path ||
                      (item.path !== APP_ROUTES.ADMIN &&
                        pathname.startsWith(item.path));

                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => navigateTo(item.path)}
                        className={`px-3 py-1.5 rounded-lg ${
                          isActive ? 'bg-brand-primary' : 'bg-transparent'
                        }`}
                        style={{ cursor: 'pointer' as any }}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isActive ? 'text-white' : 'text-brand-textSoft'
                          }`}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* ======================================================== */}
          {/* MOBILE DRAWER MODAL                                      */}
          {/* ======================================================== */}
          {!isDesktop && mobileDrawerOpen && (
            <View
              style={{
                position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999999,
                flexDirection: 'row',
              }}
            >
              {/* Backdrop */}
              <Pressable
                onPress={() => setMobileDrawerOpen(false)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                }}
              />

              {/* Drawer Content */}
              <View
                className="w-4/5 max-w-xs h-full bg-white shadow-2xl flex-col justify-between"
                style={{ zIndex: 1000000 }}
              >
                <View className="p-4 border-b border-brand-line/20 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Compass size={22} color={BRAND_COLORS.primary} />
                    <Text className="font-display font-bold text-base text-brand-text">
                      ViVu Quản Trị
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setMobileDrawerOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-100"
                  >
                    <X size={20} color={BRAND_COLORS.textMuted} />
                  </Pressable>
                </View>

                <ScrollView className="flex-1 p-3">
                  {renderNavList()}
                </ScrollView>

                <View className="p-4 border-t border-brand-line/20 bg-slate-50 gap-3">
                  <View className="flex-row items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-brand-line/20">
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(31, 111, 84, 0.12)' }}
                    >
                      <Text className="text-xs font-bold text-brand-primary">
                        {adminName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-xs font-bold text-brand-text truncate"
                        numberOfLines={1}
                      >
                        {adminName}
                      </Text>
                      <Text
                        className="text-[10px] text-brand-textMuted truncate"
                        numberOfLines={1}
                      >
                        {adminEmail}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      setMobileDrawerOpen(false);
                      signOut();
                    }}
                    className="flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-50/80 border border-red-200"
                    style={{ cursor: 'pointer' as any }}
                  >
                    <LogOut size={14} color={BRAND_COLORS.danger} />
                    <Text className="text-xs font-bold text-red-700">
                      Đăng xuất
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* ======================================================== */}
          {/* MAIN CONTENT AREA                                        */}
          {/* ======================================================== */}
          <View className="flex-1 h-full overflow-hidden bg-brand-bg">
            {children}
          </View>
        </View>
      </AdminShellContext.Provider>
    </AdminToastProvider>
  );
}
