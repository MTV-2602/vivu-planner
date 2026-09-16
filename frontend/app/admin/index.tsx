import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Users, Map, AlertTriangle, Key, Compass, Shield, ArrowRight, Zap, Crown, BarChart3, CheckCircle2, ChevronRight } from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import Reveal from '../../components/Reveal';

interface AdminStats { totalUsers: number; totalTrips: number; totalDisruptions: number; totalApiKeys: number; totalPartners: number; }

export default function AdminDashboard() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
    enabled: !!isAdmin,
  });

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg">
        <AdminNav />
        <View className="flex-1 items-center justify-center py-20 gap-3">
          <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
          <Text className="text-xs font-semibold text-brand-textSoft">Đang tải và xác thực quyền quản trị...</Text>
        </View>
      </View>
    );
  }

  const STAT_CARDS = [
    { icon: <Users size={22} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, label: 'Người dùng', value: stats?.totalUsers, route: APP_ROUTES.ADMIN_USERS },
    { icon: <Map size={22} color={BRAND_COLORS.accent} />, bg: `${BRAND_COLORS.accent}1A`, label: 'Chuyến đi', value: stats?.totalTrips, route: APP_ROUTES.ADMIN_TRIPS },
    { icon: <AlertTriangle size={22} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, label: 'Sự cố AI', value: stats?.totalDisruptions, route: APP_ROUTES.ADMIN_TRIPS },
    { icon: <Key size={22} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}1A`, label: 'Bể API Keys', value: stats?.totalApiKeys, route: APP_ROUTES.ADMIN_KEYS },
    { icon: <Compass size={22} color={BRAND_COLORS.primaryStrong} />, bg: `${BRAND_COLORS.primaryStrong}1A`, label: 'Đối tác', value: stats?.totalPartners, route: APP_ROUTES.ADMIN_PARTNERS },
  ];

  const QUICK_ACTIONS = [
    { label: 'Cấu hình & Test AI Gateway', desc: 'Quản lý Model AI Pro, giới hạn tokens & Ping Test', icon: <Zap size={18} color="#2563EB" />, bg: '#EFF6FF', route: APP_ROUTES.ADMIN_KEYS },
    { label: 'Quản lý Gói & Bảng giá', desc: 'Tùy chỉnh giá cước Starter & ViVu Pro', icon: <Crown size={18} color="#D97706" />, bg: '#FFFBEB', route: APP_ROUTES.ADMIN_PACKAGES },
    { label: 'Phân quyền Người dùng', desc: 'Cấp quyền Admin, phân bổ lượt tạo lịch trình', icon: <Users size={18} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, route: APP_ROUTES.ADMIN_USERS },
    { label: 'Theo dõi Doanh thu', desc: 'Thống kê giao dịch qua MoMo & VietQR PayOS', icon: <BarChart3 size={18} color="#059669" />, bg: '#ECFDF5', route: APP_ROUTES.ADMIN_REVENUE },
  ];

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        {/* Header */}
        <View className="gap-1">
          <View className="flex-row items-center gap-2.5">
            <Shield size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-extrabold text-3xl text-brand-text">Bảng Điều Khiển Quản Trị</Text>
          </View>
          <Text className="text-sm text-brand-textSoft">Tổng quan trạng thái thời gian thực của hệ thống ViVu Planner</Text>
        </View>

        {/* 5 Thẻ Thống kê có thể click */}
        <Reveal>
          <View className="flex-row flex-wrap gap-4">
            {STAT_CARDS.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => s.route && router.push(s.route as any)}
                className="p-5 rounded-2xl border border-brand-line/40 flex-row items-center justify-between bg-white hover:border-brand-primary/50 shadow-sm"
                style={{ minWidth: 160, flex: 1, cursor: 'pointer' as any }}
              >
                <View className="flex-row items-center gap-3.5">
                  <View className="w-12 h-12 rounded-xl items-center justify-center shrink-0" style={{ backgroundColor: s.bg }}>
                    {s.icon}
                  </View>
                  <View>
                    <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">{s.label}</Text>
                    <Text className="font-display font-bold text-2xl text-brand-text mt-0.5">
                      {statsLoading ? '...' : (s.value ?? 0)}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={BRAND_COLORS.textMuted} />
              </Pressable>
            ))}
          </View>
        </Reveal>

        {/* Lối tắt quản trị nhanh */}
        <View className="gap-3">
          <Text className="text-xs font-bold text-brand-text uppercase tracking-wider">⚡ Tác Vụ Quản Trị Nhanh</Text>
          <View className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {QUICK_ACTIONS.map((a, idx) => (
              <Pressable
                key={idx}
                onPress={() => router.push(a.route as any)}
                className="p-4 rounded-2xl border border-brand-line/50 bg-white hover:border-brand-primary flex-row items-center justify-between shadow-sm"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="flex-row items-center gap-3.5 flex-1">
                  <View className="w-10 h-10 rounded-xl items-center justify-center shrink-0" style={{ backgroundColor: a.bg }}>
                    {a.icon}
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-bold text-brand-text">{a.label}</Text>
                    <Text className="text-xs text-brand-textSoft mt-0.5" numberOfLines={1}>{a.desc}</Text>
                  </View>
                </View>
                <ArrowRight size={15} color={BRAND_COLORS.primary} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Giám sát sức khỏe dịch vụ */}
        <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/40 gap-3.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-brand-text uppercase tracking-wider">🛡️ Trạng Thái Hạ Tầng & Dịch Vụ Hệ Thống</Text>
            <View className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300">
              <CheckCircle2 size={11} color="#059669" />
              <Text className="text-[10px] font-bold text-emerald-800">Tất cả hoạt động tốt</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-3">
            {[
              { title: 'Cổng AI Gateway (Pro)', sub: 'ag/gemini-3.8-flash (Auto-fallback BẬT)', status: 'Hoạt động', color: '#059669' },
              { title: 'Bể Keys Google Gemini', sub: 'Tự động xoay vòng 5 API Keys', status: 'Hoạt động', color: '#059669' },
              { title: 'Thanh toán MoMo & PayOS', sub: 'Webhook & Chữ ký HMAC SHA256', status: 'Sẵn sàng', color: '#059669' },
              { title: 'Supabase PostgreSQL', sub: 'Cơ sở dữ liệu & Realtime Cloud', status: 'Đã kết nối', color: '#059669' },
            ].map((svc, sIdx) => (
              <View key={sIdx} className="flex-1 min-w-[220px] p-3.5 rounded-xl border border-brand-line/40 bg-white gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-brand-text">{svc.title}</Text>
                  <Text className="text-[10px] font-bold" style={{ color: svc.color }}>● {svc.status}</Text>
                </View>
                <Text className="text-[11px] text-brand-textSoft">{svc.sub}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
