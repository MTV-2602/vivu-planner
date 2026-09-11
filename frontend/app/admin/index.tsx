import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Users, Map, AlertTriangle, Key, Compass, Shield } from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import Reveal from '../../components/Reveal';

interface AdminStats { totalUsers: number; totalTrips: number; totalDisruptions: number; totalApiKeys: number; totalPartners: number; }

export default function AdminDashboard() {
  const { isAdmin } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
    enabled: !!isAdmin,
  });

  if (!isAdmin) return null;

  const STAT_CARDS = [
    { icon: <Users size={22} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, label: 'Người dùng', value: stats?.totalUsers },
    { icon: <Map size={22} color={BRAND_COLORS.accent} />, bg: `${BRAND_COLORS.accent}1A`, label: 'Chuyến đi', value: stats?.totalTrips },
    { icon: <AlertTriangle size={22} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, label: 'Sự cố AI', value: stats?.totalDisruptions },
    { icon: <Key size={22} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}1A`, label: 'Bể API Keys', value: stats?.totalApiKeys },
    { icon: <Compass size={22} color={BRAND_COLORS.primaryStrong} />, bg: `${BRAND_COLORS.primaryStrong}1A`, label: 'Đối tác', value: stats?.totalPartners },
  ];

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        <View className="gap-1">
          <View className="flex-row items-center gap-2.5">
            <Shield size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-extrabold text-3xl text-brand-text">Quản Trị Hệ Thống</Text>
          </View>
          <Text className="text-sm text-brand-textSoft">Giám sát người dùng, chuyến đi và hệ thống ViVu Planner</Text>
        </View>

        <Reveal>
          <View className="flex-row flex-wrap gap-4">
            {STAT_CARDS.map((s, i) => (
              <View key={i} className="p-5 rounded-2xl border border-brand-line/40 flex-row items-center gap-4 bg-brand-bgAlt/50" style={{ minWidth: 140, flex: 1 }}>
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
            ))}
          </View>
        </Reveal>
      </ScrollView>
    </View>
  );
}
